import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPositions, getAccount, getOrders } from '@/lib/api/alpaca';
import { logAuditEvent } from '@/lib/services/audit';
import { getAutonomyConfig, executeQueueTradeByTicker } from '@/lib/services/autonomy';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface AgentDecision {
  action: 'AUTO_EXECUTE' | 'QUEUE_FOR_APPROVAL' | 'NOTIFY' | 'SKIP';
  issue: string;
  rationale: string;
  endpoint?: string;
  method?: string;
  body?: Record<string, unknown> | null;
  priority: 'critical' | 'high' | 'medium' | 'low';
  ticker?: string;
}

export interface AgentRunResult {
  ran_at: string;
  decisions: AgentDecision[];
  executed: number;
  queued: number;
  notified: number;
  skipped: number;
  errors: string[];
  duration_ms: number;
}

function getBaseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

async function gatherStatus(): Promise<string> {
  const supabase = createAdminClient();
  const sections: string[] = [];

  try {
    const [positions, account, orders] = await Promise.all([
      getPositions(),
      getAccount(),
      getOrders('open', 20),
    ]);

    const equity = parseFloat((account as { equity?: string })?.equity || '0');
    const dayPnL =
      equity - parseFloat((account as { last_equity?: string })?.last_equity || equity.toString());

    sections.push(`PORTFOLIO:
Equity: $${equity.toLocaleString()} | Day P&L: ${dayPnL >= 0 ? '+' : ''}$${dayPnL.toFixed(2)}
Open positions: ${(positions as unknown[]).length}
${(positions as { symbol: string; unrealized_plpc?: string }[])
  .map((p) => {
    const pnl = parseFloat(p.unrealized_plpc || '0') * 100;
    return `  ${p.symbol}: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}% P&L`;
  })
  .join('\n')}
Pending orders: ${(orders as unknown[]).length}`);
  } catch {
    sections.push('PORTFOLIO: Unavailable');
  }

  try {
    const { data: alerts } = await supabase
      .from('price_alerts')
      .select('*')
      .in('status', ['active', 'triggered']);

    const triggered = (alerts || []).filter((a: { status: string }) => a.status === 'triggered');
    const active = (alerts || []).filter((a: { status: string }) => a.status === 'active');

    sections.push(`PRICE ALERTS:
Triggered undismissed: ${triggered.length}
${triggered
  .map(
    (a: { ticker: string; condition: string; target_price: number }) =>
      `  ${a.ticker} ${a.condition} $${a.target_price} TRIGGERED`
  )
  .join('\n')}
Active: ${active.length}`);
  } catch {
    /* skip */
  }

  try {
    const { data: posAlerts } = await supabase
      .from('position_alerts')
      .select('*')
      .eq('status', 'active')
      .order('fired_at', { ascending: false })
      .limit(5);

    sections.push(`POSITION ALERTS:
Active: ${(posAlerts || []).length}
${(posAlerts || [])
  .map(
    (a: { severity: string; ticker: string; message: string }) =>
      `  [${a.severity}] ${a.ticker}: ${a.message}`
  )
  .join('\n')}`);
  } catch {
    /* skip */
  }

  try {
    const { data: queue } = await supabase
      .from('trade_queue')
      .select('ticker, instrument_type, conviction_score, expires_at')
      .eq('status', 'pending');

    sections.push(`TRADE QUEUE:
Pending approval: ${(queue || []).length}
${(queue || [])
  .map(
    (t: { ticker: string; instrument_type: string; conviction_score: number }) =>
      `  ${t.ticker} ${t.instrument_type} — conviction ${t.conviction_score}/10`
  )
  .join('\n')}`);
  } catch {
    /* skip */
  }

  try {
    const { data: stopAlerts } = await supabase
      .from('price_alerts')
      .select('ticker')
      .eq('status', 'active')
      .eq('condition', 'below');

    const protectedTickers = new Set(
      (stopAlerts || []).map((a: { ticker: string }) => a.ticker)
    );
    const posRes = await getPositions();
    const unprotected = (posRes as { symbol: string }[])
      .filter((p) => !protectedTickers.has(p.symbol))
      .map((p) => p.symbol);

    if (unprotected.length > 0) {
      sections.push(`UNPROTECTED POSITIONS:
${unprotected.join(', ')} — no stop loss alerts set`);
    }
  } catch {
    /* skip */
  }

  try {
    const { data: cronRuns } = await supabase
      .from('cron_runs')
      .select('job_name, status, ran_at')
      .order('ran_at', { ascending: false })
      .limit(10);

    const jobMap: Record<string, { job_name: string; status: string; ran_at: string }> = {};
    (cronRuns || []).forEach((r: { job_name: string; status: string; ran_at: string }) => {
      if (!jobMap[r.job_name]) jobMap[r.job_name] = r;
    });

    const failedJobs = Object.values(jobMap).filter((r) => r.status === 'failed');
    if (failedJobs.length > 0) {
      sections.push(`FAILED CRON JOBS:
${failedJobs.map((r) => `  ${r.job_name}: failed at ${r.ran_at}`).join('\n')}`);
    }
  } catch {
    /* skip */
  }

  try {
    const { data: signals } = await supabase
      .from('signals')
      .select('ticker, signal_type, strength, status')
      .eq('strength', 'high')
      .eq('status', 'pending')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(5);

    if ((signals || []).length > 0) {
      sections.push(`HIGH CONVICTION SIGNALS (unacted):
${(signals || [])
  .map((s: { ticker: string; signal_type: string }) => `  ${s.ticker}: ${s.signal_type}`)
  .join('\n')}`);
    }
  } catch {
    /* skip */
  }

  return sections.join('\n\n');
}

export async function runAutonomousAgent(): Promise<AgentRunResult> {
  const startTime = Date.now();
  const supabase = createAdminClient();

  const { data: settings } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'autonomous_agent_enabled')
    .maybeSingle();

  if (settings?.value?.enabled === false) {
    return {
      ran_at: new Date().toISOString(),
      decisions: [],
      executed: 0,
      queued: 0,
      notified: 0,
      skipped: 1,
      errors: [],
      duration_ms: Date.now() - startTime,
    };
  }

  const { data: recentActions } = await supabase
    .from('audit_log')
    .select('action_taken, event_at')
    .eq('source', 'system')
    .gte('event_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .order('event_at', { ascending: false })
    .limit(20);

  const recentActionSummary =
    (recentActions || []).map((a: { action_taken: string }) => a.action_taken).join('\n') ||
    'None';

  const status = await gatherStatus();
  const autonomy = await getAutonomyConfig();

  const autonomyInstruction = autonomy.enabled
    ? `FULL AUTONOMY MODE IS ACTIVE${autonomy.days_remaining != null ? ` (${autonomy.days_remaining} days remaining)` : ''}.
In this mode:
- AUTO_EXECUTE all safe maintenance actions as normal
- AUTO_EXECUTE trade entries IF conviction ≥ ${autonomy.min_conviction} and position ≤ ${autonomy.max_position_pct}%
- AUTO_EXECUTE stop loss closes when breached
- AUTO_EXECUTE rebalance trims when over limit
- NOTIFY for anything unusual that should be logged
- SKIP only when truly nothing to do
There is NO human approval step. Execute everything that meets the strategy rules.`
    : `APPROVAL MODE: Queue trades for human approval. Auto-execute only safe maintenance.`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `You are Dark Recon's Autonomous Action Agent. You run every 10 minutes to keep the platform operating perfectly. Review the current platform status and decide what actions to take.

CURRENT PLATFORM STATUS:
${status}

ACTIONS TAKEN IN LAST HOUR (avoid repeating these):
${recentActionSummary}

${autonomyInstruction}

DECISION RULES:
- AUTO_EXECUTE: Safe, reversible, system maintenance actions
  Examples: create missing stop loss, dismiss triggered alert, refresh stale data, log audit entry
- QUEUE_FOR_APPROVAL: Trade decisions requiring human judgment
  Examples: new position entry, rebalancing trim, stop loss close
- NOTIFY: Flag for human awareness, no action taken
  Examples: correlation risk, approaching stop, earnings catalyst tomorrow
- SKIP: Not actionable, already handled, or market closed

Return ONLY a valid JSON array. No markdown. Max 5 decisions per run:
[
  {
    "action": "AUTO_EXECUTE",
    "issue": "NVDA position has no stop loss alert",
    "rationale": "Position is unprotected. Auto-creating 7% stop loss at $201 to protect $12,900 position.",
    "endpoint": "/api/portfolio/audit",
    "method": "GET",
    "body": null,
    "priority": "high",
    "ticker": "NVDA"
  },
  {
    "action": "SKIP",
    "issue": "Platform status nominal",
    "rationale": "All positions protected, no triggered alerts, crons running normally.",
    "priority": "low"
  }
]

Be conservative with AUTO_EXECUTE. When in doubt, NOTIFY or SKIP.
${autonomy.enabled ? 'In full autonomy mode, AUTO_EXECUTE qualifying trades directly — do not use QUEUE_FOR_APPROVAL.' : 'Never AUTO_EXECUTE trade entries — those always go to QUEUE_FOR_APPROVAL.'}
Never AUTO_EXECUTE position closes without checking if stop was actually breached.`,
      },
    ],
  });

  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('');
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');

  let decisions: AgentDecision[] = [];
  try {
    decisions = JSON.parse(raw.slice(start, end + 1));
  } catch {
    decisions = [
      {
        action: 'SKIP',
        issue: 'Parse error',
        rationale: 'Agent response could not be parsed',
        priority: 'low',
      },
    ];
  }

  const result: AgentRunResult = {
    ran_at: new Date().toISOString(),
    decisions,
    executed: 0,
    queued: 0,
    notified: 0,
    skipped: 0,
    errors: [],
    duration_ms: 0,
  };

  for (const decision of decisions) {
    try {
      const effectiveAction =
        autonomy.enabled && decision.action === 'QUEUE_FOR_APPROVAL'
          ? 'AUTO_EXECUTE'
          : decision.action;

      if (effectiveAction === 'AUTO_EXECUTE' && decision.endpoint) {
        const baseUrl = getBaseUrl();
        const res = await fetch(`${baseUrl}${decision.endpoint}`, {
          method: decision.method || 'GET',
          headers: { 'Content-Type': 'application/json' },
          body: decision.body ? JSON.stringify(decision.body) : undefined,
        });

        const success = res.ok;
        result.executed++;

        await logAuditEvent({
          event_type: 'autopilot_action_taken',
          ticker: decision.ticker,
          action_taken: `AUTONOMOUS: ${decision.issue}`,
          rationale: decision.rationale,
          outcome: 'not_applicable',
          source: 'system',
          raw_data: { decision, success, full_autonomy: autonomy.enabled },
        });
      } else if (
        effectiveAction === 'AUTO_EXECUTE' &&
        !decision.endpoint &&
        decision.ticker &&
        autonomy.enabled
      ) {
        const executed = await executeQueueTradeByTicker(decision.ticker);
        if (executed) {
          result.executed++;
          await logAuditEvent({
            event_type: 'autopilot_action_taken',
            ticker: decision.ticker,
            action_taken: `AUTONOMOUS TRADE: ${decision.issue}`,
            rationale: decision.rationale,
            outcome: 'pending',
            source: 'system',
            raw_data: { decision, full_autonomy: true },
          });
        } else {
          result.skipped++;
        }
      } else if (decision.action === 'QUEUE_FOR_APPROVAL') {
        result.queued++;

        await logAuditEvent({
          event_type: 'trade_queue_built',
          ticker: decision.ticker,
          action_taken: `QUEUED FOR APPROVAL: ${decision.issue}`,
          rationale: decision.rationale,
          outcome: 'pending',
          source: 'system',
        });
      } else if (decision.action === 'NOTIFY') {
        const { error: alertError } = await supabase.from('position_alerts').insert({
          ticker: decision.ticker || 'SYSTEM',
          alert_type: 'drawdown_warning',
          message: `🤖 AGENT: ${decision.issue} — ${decision.rationale}`,
          severity:
            decision.priority === 'critical'
              ? 'critical'
              : decision.priority === 'high'
                ? 'warning'
                : 'info',
          status: 'active',
          fired_at: new Date().toISOString(),
        });
        if (alertError) console.error(alertError);

        result.notified++;
      } else {
        result.skipped++;
      }
    } catch (e) {
      result.errors.push(`${decision.issue}: ${e instanceof Error ? e.message : 'Error'}`);
    }
  }

  result.duration_ms = Date.now() - startTime;

  const { error: cronError } = await supabase.from('cron_runs').insert({
    job_name: 'autonomous-agent',
    status: result.errors.length === 0 ? 'success' : 'partial',
    results: {
      executed: result.executed,
      queued: result.queued,
      notified: result.notified,
      skipped: result.skipped,
      errors: result.errors,
      decisions: result.decisions.map((d) => ({
        action: d.action,
        issue: d.issue,
        rationale: d.rationale,
        priority: d.priority,
        ticker: d.ticker,
        endpoint: d.endpoint,
      })),
      platform_snapshot: status.slice(0, 500),
    },
    duration_ms: result.duration_ms,
    ran_at: result.ran_at,
  });
  if (cronError) console.error(cronError);

  return result;
}
