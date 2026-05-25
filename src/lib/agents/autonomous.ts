import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPositions, getAccount, getOrders } from '@/lib/api/alpaca';
import { logAuditEvent } from '@/lib/services/audit';
import { getAutonomyConfig, executeQueueTradeByTicker } from '@/lib/services/autonomy';
import { runIntelligenceSweep } from '@/lib/agents/intelligence';
import { getRecentCongressionalTrades } from '@/lib/api/smartmoney';
import { getUnusualOptionsFlow } from '@/lib/api/options-flow';
import { calculateSignalWeights } from '@/lib/services/signal-learning';
import { runSignalConfirmation } from '@/lib/services/signal-confirmation';
import { buildThesesForConfirmedSignals, type AutoThesis } from '@/lib/services/auto-thesis';
import type { ConfirmedSignal } from '@/lib/services/signal-confirmation';

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

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

const TIER2_API_TIMEOUT_MS = 3000;

function withTier2Timeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout`)), TIER2_API_TIMEOUT_MS)
    ),
  ]);
}

async function getTierLevel(
  supabase: SupabaseAdmin
): Promise<{ tier: number; run_count: number }> {
  try {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'agent_run_count')
      .maybeSingle();

    const count = ((data?.value as { count?: number })?.count || 0) + 1;

    await supabase.from('settings').upsert(
      {
        key: 'agent_run_count',
        value: { count, last_run: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

    const tier = count % 6 === 0 ? 3 : count % 3 === 0 ? 2 : 1;
    return { tier, run_count: count };
  } catch {
    return { tier: 1, run_count: 1 };
  }
}

async function gatherStatus(
  supabase: SupabaseAdmin
): Promise<{ status: string; tier: number; fresh_data: Record<string, unknown> }> {
  const { tier, run_count } = await getTierLevel(supabase);
  const sections: string[] = [];
  const freshData: Record<string, unknown> = { tier, run_count };

  // TIER 1 — Every run (live data, fast)
  try {
    const [positions, account, orders] = await Promise.all([
      getPositions(),
      getAccount(),
      getOrders('open', 20),
    ]);

    const equity = parseFloat((account as { equity?: string })?.equity || '0');
    const lastEquity = parseFloat(
      (account as { last_equity?: string })?.last_equity || equity.toString()
    );
    const dayPnL = equity - lastEquity;
    const dayPnLPct = lastEquity > 0 ? (dayPnL / lastEquity) * 100 : 0;

    freshData.equity = equity;
    freshData.positions = positions;
    freshData.day_pnl = dayPnL;

    sections.push(`LIVE PORTFOLIO (Tier 1 — refreshed now):
Equity: $${equity.toLocaleString()} | Day P&L: ${dayPnL >= 0 ? '+' : ''}$${dayPnL.toFixed(2)} (${dayPnLPct >= 0 ? '+' : ''}${dayPnLPct.toFixed(2)}%)
Open positions: ${(positions as unknown[]).length}
${(positions as { symbol: string; unrealized_plpc?: string; market_value?: string }[])
  .map((p) => {
    const pnl = parseFloat(p.unrealized_plpc || '0') * 100;
    return `  ${p.symbol}: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}% total P&L | $${parseFloat(p.market_value || '0').toFixed(0)} position`;
  })
  .join('\n')}
Pending orders: ${(orders as unknown[]).length}
${(orders as { symbol: string; side: string; qty: string; limit_price?: string }[])
  .map((o) => `  ${o.symbol}: ${o.side} ${o.qty} @ $${o.limit_price || 'market'}`)
  .join('\n')}`);
  } catch {
    sections.push('LIVE PORTFOLIO: Fetch failed');
  }

  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: recentSignals } = await supabase
      .from('signals')
      .select('ticker, signal_type, strength, status, created_at')
      .gte('created_at', twoHoursAgo)
      .order('created_at', { ascending: false })
      .limit(10);

    const highConviction = (recentSignals || []).filter(
      (s: { strength: string }) => s.strength === 'high'
    );

    if (highConviction.length > 0) {
      sections.push(`RECENT HIGH CONVICTION SIGNALS (last 2h):
${highConviction
  .map(
    (s: { ticker: string; signal_type: string; status: string }) =>
      `  ${s.ticker}: ${s.signal_type} (${s.status})`
  )
  .join('\n')}`);
      freshData.recent_signals = highConviction;
    }
  } catch {
    /* skip */
  }

  try {
    const { data: intradaySignals } = await supabase
      .from('signals')
      .select('ticker, signal_type, strength, notes')
      .in('signal_type', [
        'gap_and_go',
        'vwap_reclaim',
        'orb_breakout',
        'momentum_continuation',
        'reversal_short',
        'high_of_day_break',
      ])
      .eq('status', 'pending')
      .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if ((intradaySignals || []).length > 0) {
      sections.push(`LIVE INTRADAY SETUPS (last 5 min):
${(intradaySignals || [])
  .map(
    (s: { ticker: string; signal_type: string; notes?: string }) =>
      `  ${s.ticker} [${s.signal_type.replace(/_/g, ' ').toUpperCase()}]: ${s.notes || ''}`
  )
  .join('\n')}`);
      freshData.intraday_signals = intradaySignals;
    }
  } catch {
    /* skip */
  }

  try {
    const [priceAlerts, posAlerts] = await Promise.all([
      supabase.from('price_alerts').select('*').in('status', ['active', 'triggered']),
      supabase
        .from('position_alerts')
        .select('*')
        .eq('status', 'active')
        .order('fired_at', { ascending: false })
        .limit(5),
    ]);

    const triggered = (priceAlerts.data || []).filter(
      (a: { status: string }) => a.status === 'triggered'
    );
    if (triggered.length > 0) {
      sections.push(`TRIGGERED PRICE ALERTS (action needed):
${triggered
  .map(
    (a: { ticker: string; condition: string; target_price: number }) =>
      `  ${a.ticker} ${a.condition} $${a.target_price} — TRIGGERED`
  )
  .join('\n')}`);
    }

    const criticalAlerts = (posAlerts.data || []).filter(
      (a: { severity: string }) => a.severity === 'critical'
    );
    if (criticalAlerts.length > 0) {
      sections.push(`CRITICAL POSITION ALERTS:
${criticalAlerts
  .map((a: { ticker: string; message: string }) => `  ${a.ticker}: ${a.message}`)
  .join('\n')}`);
    }
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
    const allPositions =
      (freshData.positions as { symbol: string }[] | undefined) || [];
    const unprotected = allPositions
      .filter((p) => !protectedTickers.has(p.symbol))
      .map((p) => p.symbol);

    if (unprotected.length > 0) {
      sections.push(`UNPROTECTED POSITIONS (no stop loss):
${unprotected.join(', ')} — stops must be created immediately`);
      freshData.unprotected = unprotected;
    }
  } catch {
    /* skip */
  }

  try {
    const { data: queue } = await supabase
      .from('trade_queue')
      .select('ticker, instrument_type, conviction_score, expires_at, status')
      .in('status', ['pending', 'executed'])
      .order('queued_at', { ascending: false })
      .limit(10);

    const pending = (queue || []).filter((t: { status: string }) => t.status === 'pending');
    const executedToday = (queue || []).filter((t: { status: string; expires_at: string }) => {
      if (t.status !== 'executed') return false;
      return new Date(t.expires_at).toDateString() === new Date().toDateString();
    });

    sections.push(`TRADE QUEUE:
Pending approval: ${pending.length}
${pending
  .map(
    (t: { ticker: string; instrument_type: string; conviction_score: number }) =>
      `  ${t.ticker} ${t.instrument_type} — conviction ${t.conviction_score}/10`
  )
  .join('\n')}
Executed today: ${executedToday.length}`);
  } catch {
    /* skip */
  }

  // TIER 2 — Every 30 minutes (full intelligence pipeline)
  if (tier >= 2) {
    sections.push(`\n--- TIER 2: FULL INTELLIGENCE PIPELINE ---`);

    try {
      const sweepResult = await withTier2Timeout(
        runIntelligenceSweep(),
        'Intelligence sweep'
      ).catch(() => [] as Awaited<ReturnType<typeof runIntelligenceSweep>>);
      const highStrength = sweepResult.filter((s) => s.strength === 'high');
      sections.push(`INTELLIGENCE SWEEP: ${sweepResult.length} signals, ${highStrength.length} high strength`);
      freshData.intelligence_signals = highStrength;
    } catch {
      sections.push('INTELLIGENCE SWEEP: Failed to run');
    }

    try {
      const confirmedSignals = await withTier2Timeout(
        runSignalConfirmation(),
        'Signal confirmation'
      ).catch(() => [] as ConfirmedSignal[]);
      freshData.confirmed_signals = confirmedSignals;

      if (confirmedSignals.length > 0) {
        sections.push(`CONFIRMED SIGNALS (cross-referenced from all sources):
${confirmedSignals
  .slice(0, 8)
  .map(
    (s: ConfirmedSignal) =>
      `  ${s.ticker} [${s.confirmation_score}/10]: ${s.source_count} sources (${s.sources.join(', ')}) — ${s.best_reason.slice(0, 100)}`
  )
  .join('\n')}`);

        const theses = await withTier2Timeout(
          buildThesesForConfirmedSignals(confirmedSignals),
          'Thesis builder'
        ).catch(() => [] as AutoThesis[]);
        freshData.auto_theses = theses;

        if (theses.length > 0) {
          sections.push(`AUTO-BUILT THESES (ready for execution):
${theses
  .map(
    (t: AutoThesis) =>
      `  ${t.ticker} [conviction ${t.conviction_score}/10]: ${t.thesis} | Catalyst: ${t.catalyst}`
  )
  .join('\n')}`);
        }
      } else {
        sections.push('SIGNAL CONFIRMATION: No multi-source confirmations this cycle');
      }
    } catch (e) {
      sections.push(
        `SIGNAL CONFIRMATION: Failed — ${e instanceof Error ? e.message : 'error'}`
      );
    }

    try {
      const { getSectorRotation } = await import('@/lib/services/sector-rotation');
      const rotation = await withTier2Timeout(getSectorRotation(), 'Sector rotation').catch(
        () => null
      );
      if (rotation) {
        sections.push(`SECTOR ROTATION (live):
${rotation.rotation_signal}
Leading: ${rotation.leading_sectors.map((s) => `${s.sector} ${s.change_1d >= 0 ? '+' : ''}${s.change_1d.toFixed(2)}%`).join(' | ')}
Lagging: ${rotation.lagging_sectors.map((s) => `${s.sector} ${s.change_1d.toFixed(2)}%`).join(' | ')}`);

        freshData.sector_rotation = rotation;
      }
    } catch {
      /* skip */
    }

    try {
      const { getMacroSnapshot } = await import('@/lib/api/fred');
      const macro = await withTier2Timeout(getMacroSnapshot(), 'FRED macro').catch(() => null);
      if (macro) {
        sections.push(macro.market_backdrop);
        freshData.macro_regime = macro.macro_regime;
      }
    } catch {
      /* skip */
    }

    try {
      const congressTrades = await Promise.race([
        getRecentCongressionalTrades(7, 20),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Quiver timeout')), TIER2_API_TIMEOUT_MS)
        ),
      ]).catch(() => [] as Awaited<ReturnType<typeof getRecentCongressionalTrades>>);
      const recentTrades = congressTrades.slice(0, 5);

      if (recentTrades.length > 0) {
        sections.push(`CONGRESSIONAL TRADING (last 7 days):
${recentTrades
  .map((t) => `  ${t.representative}: ${t.type} ${t.ticker} — ${t.amount}`)
  .join('\n')}`);
        freshData.congressional = recentTrades;
      }
    } catch {
      /* skip */
    }

    try {
      const { data: earnings } = await supabase
        .from('earnings_events')
        .select('symbol, date, hour, eps_estimate')
        .gte('date', new Date().toISOString().split('T')[0])
        .lte(
          'date',
          new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        )
        .order('date', { ascending: true })
        .limit(5);

      if ((earnings || []).length > 0) {
        sections.push(`UPCOMING EARNINGS (next 5 days):
${(earnings || [])
  .map(
    (e: { symbol: string; date: string; hour: string; eps_estimate?: number }) =>
      `  ${e.symbol}: ${e.date} ${e.hour === 'bmo' ? 'BMO' : 'AMC'} | EPS est: $${e.eps_estimate || 'N/A'}`
  )
  .join('\n')}`);
        freshData.earnings = earnings;
      }
    } catch {
      /* skip */
    }

    try {
      const weights = await calculateSignalWeights();
      if (weights.total_signals_tracked > 0) {
        sections.push(`SIGNAL PERFORMANCE (learning layer):
Overall win rate: ${weights.overall_win_rate.toFixed(1)}%
Best signal: ${weights.best_signal} | Worst: ${weights.worst_signal}
${weights.recommendation}`);
      }
    } catch {
      /* skip */
    }
  }

  // TIER 3 — Every 60 minutes (deep analysis)
  if (tier >= 3) {
    sections.push(`\n--- TIER 3 REFRESH (60-min cycle) ---`);

    try {
      const optionsFlow = await getUnusualOptionsFlow();
      const highFlow = optionsFlow.filter((f) => f.signal_strength === 'high');

      if (highFlow.length > 0) {
        sections.push(`UNUSUAL OPTIONS FLOW (just refreshed):
${highFlow
  .slice(0, 3)
  .map(
    (f) =>
      `  ${f.ticker} ${f.type.toUpperCase()} $${f.strike}: ${f.description}`
  )
  .join('\n')}`);
        freshData.options_flow = highFlow;
      }
    } catch {
      /* skip */
    }

    try {
      const { runRebalanceCheck } = await import('@/lib/agents/rebalance');
      const rebalanceActions = await runRebalanceCheck();
      const immediate = rebalanceActions.filter((a) => a.urgency === 'immediate');

      if (immediate.length > 0) {
        sections.push(`REBALANCE NEEDED:
${immediate.map((a) => `  ${a.ticker}: ${a.reason}`).join('\n')}`);
        freshData.rebalance = immediate;
      }
    } catch {
      /* skip */
    }

    try {
      const { runCorrelationMonitor } = await import('@/lib/services/correlation');
      const correlationAlerts = await runCorrelationMonitor();

      if (correlationAlerts.length > 0) {
        sections.push(`CORRELATION RISK:
${correlationAlerts.map((a) => `  ${a.message} (${a.risk_level})`).join('\n')}`);
      }
    } catch {
      /* skip */
    }

    try {
      const { data: cronRuns } = await supabase
        .from('cron_runs')
        .select('job_name, status, ran_at')
        .order('ran_at', { ascending: false })
        .limit(20);

      const jobMap: Record<string, { job_name: string; status: string; ran_at: string }> = {};
      (cronRuns || []).forEach((r: { job_name: string; status: string; ran_at: string }) => {
        if (!jobMap[r.job_name]) jobMap[r.job_name] = r;
      });

      const failedJobs = Object.values(jobMap).filter((r) => r.status === 'failed');
      const staleJobs = Object.values(jobMap).filter((r) => {
        const hoursAgo = (Date.now() - new Date(r.ran_at).getTime()) / (1000 * 60 * 60);
        return r.job_name === 'morning-run' && hoursAgo > 25;
      });

      if (failedJobs.length > 0 || staleJobs.length > 0) {
        sections.push(`CRON JOB ISSUES:
${failedJobs.map((r) => `  FAILED: ${r.job_name}`).join('\n')}
${staleJobs.map((r) => `  STALE: ${r.job_name} (no recent run)`).join('\n')}`);
      } else {
        sections.push(`CRON HEALTH: All jobs running normally`);
      }
    } catch {
      /* skip */
    }
  }

  const fullStatus = sections.join('\n\n');
  const status =
    fullStatus.length > 6000
      ? `${fullStatus.slice(0, 6000)}\n\n[STATUS TRUNCATED — remaining data in DB]`
      : fullStatus;

  return {
    status,
    tier,
    fresh_data: freshData,
  };
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
    .gte('event_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .order('event_at', { ascending: false })
    .limit(10);

  const recentActionSummary =
    (recentActions || []).map((a: { action_taken: string }) => a.action_taken).join('\n') ||
    'None in last 30 minutes';

  const { status, tier, fresh_data } = await gatherStatus(supabase);
  const autonomy = await getAutonomyConfig();

  const autonomyInstruction = autonomy.enabled
    ? `FULL AUTONOMY MODE ACTIVE${autonomy.days_remaining != null ? ` (${autonomy.days_remaining} days remaining in 30-day trial)` : ''}.
Execute everything that meets strategy rules. No approval needed.
Min conviction to trade: ${autonomy.min_conviction}/10 | Max position: ${autonomy.max_position_pct}% | Daily trade limit: ${autonomy.daily_trade_limit}`
    : `APPROVAL MODE: Queue trades for human approval. Auto-execute only maintenance actions.`;

  const tierNote = `INTELLIGENCE REFRESH TIER: ${tier} (${tier === 1 ? 'live data only' : tier === 2 ? 'full sweep ran' : 'deep analysis ran'})`;

  const sectorInstruction =
    autonomy.trading_mode === 'day_trading'
      ? ''
      : `
When making trade decisions, prioritize stocks in LEADING sectors and avoid stocks in LAGGING sectors.
If market regime is RISK_OFF, favor defensive positions and tighter stops.
If market regime is RISK_ON, favor growth/momentum names with higher conviction.`;

  const macroInstruction =
    autonomy.trading_mode === 'day_trading'
      ? ''
      : fresh_data.macro_regime
        ? `\nMACRO REGIME: ${String(fresh_data.macro_regime).toUpperCase()} — adjust all trade sizing and conviction accordingly.`
        : '';

  const autoTheses = fresh_data.auto_theses as AutoThesis[] | undefined;
  const confirmedSignals = fresh_data.confirmed_signals as ConfirmedSignal[] | undefined;

  const pipelineInstruction =
    autoTheses && autoTheses.length > 0
      ? `\nPIPELINE READY: ${autoTheses.length} trade theses built and confirmed by multiple sources. These have passed the full intelligence pipeline (Scanner → Signal Confirmation → Thesis Builder). In full autonomy mode, execute any with conviction ≥ ${autonomy.min_conviction} that fit portfolio rules.`
      : confirmedSignals && confirmedSignals.length > 0
        ? `\nCONFIRMED SIGNALS: ${confirmedSignals.length} tickers confirmed by multiple sources. Build theses and evaluate for execution.`
        : '';

  const dayTradingInstruction =
    autonomy.trading_mode === 'day_trading'
      ? `
DAY TRADING MODE — Decisions must be fast and decisive:
- Open AND close positions same day
- Profit targets: +2% partial, +5% full, +10% runner
- Stop: -1.5% hard cut, no exceptions
- Short on weakness (setup_type: reversal_short)
- Conviction ≥ 7 = execute in full autonomy
- Max 10 concurrent positions, 3% each
- Prioritize: HOD breaks, ORB, VWAP reclaim, gap continuation
`
      : '';

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `You are Dark Recon's Autonomous Action Agent. You just refreshed all intelligence sources and have live data. Make decisions and execute.

${tierNote}
${autonomyInstruction}
${sectorInstruction}${macroInstruction}${pipelineInstruction}${dayTradingInstruction}

FRESH PLATFORM STATUS (just gathered):
${status}

ACTIONS TAKEN IN LAST 30 MINUTES (avoid exact repetition):
${recentActionSummary}

AVAILABLE_ACTIONS:
- Dismiss triggered price alerts: GET /api/alerts/dismiss
- Check and update alerts: GET /api/alerts/check

DECISION RULES:
- AUTO_EXECUTE: Stop loss creation, alert dismissal, data refreshes, rebalance trims (in full autonomy)
- AUTO_EXECUTE (full autonomy only): Trade entries with conviction ≥ ${autonomy.min_conviction}, position closes on stop breach
- QUEUE_FOR_APPROVAL (non-autonomy): New trade entries, large position changes
- NOTIFY: Correlation warnings, approaching stops, cron failures, unusual patterns
- SKIP: Nothing actionable, already handled recently

Return ONLY valid JSON array, max 6 decisions:
[
  {
    "action": "AUTO_EXECUTE",
    "issue": "Specific issue found",
    "rationale": "Why this action, what data supports it",
    "endpoint": "/api/endpoint",
    "method": "GET",
    "body": null,
    "priority": "high",
    "ticker": "NVDA"
  }
]

Be specific — reference actual tickers, prices, and data from the status above.
${autonomy.enabled ? 'In full autonomy mode, AUTO_EXECUTE qualifying trades directly — do not use QUEUE_FOR_APPROVAL.' : 'Never AUTO_EXECUTE trade entries — those always go to QUEUE_FOR_APPROVAL.'}`,
      },
    ],
  });

  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('');

  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');

  let decisions: AgentDecision[] = [];
  if (start !== -1 && end !== -1 && end > start) {
    try {
      decisions = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      try {
        const partial = cleaned.slice(start);
        const lastBrace = partial.lastIndexOf('},');
        if (lastBrace > 0) {
          decisions = JSON.parse(`${partial.slice(0, lastBrace + 1)}]`);
        } else {
          throw new Error('No partial JSON recoverable');
        }
      } catch {
        console.error('Agent parse error. Raw response:', raw.slice(0, 500));
        decisions = [
          {
            action: 'SKIP',
            issue: 'Response parse error',
            rationale: 'Could not parse agent decisions — check logs for raw response',
            priority: 'low',
          },
        ];
      }
    }
  } else {
    console.error('No JSON array found in agent response:', raw.slice(0, 500));
    decisions = [
      {
        action: 'SKIP',
        issue: 'No decisions found',
        rationale: 'Agent returned no actionable decisions this cycle',
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

        result.executed++;

        await logAuditEvent({
          event_type: 'autopilot_action_taken',
          ticker: decision.ticker,
          action_taken: `AUTONOMOUS [Tier ${tier}]: ${decision.issue}`,
          rationale: decision.rationale,
          outcome: 'not_applicable',
          source: 'system',
          raw_data: {
            decision,
            tier,
            success: res.ok,
            fresh_data_keys: Object.keys(fresh_data),
          },
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
            action_taken: `AUTONOMOUS TRADE [Tier ${tier}]: ${decision.issue}`,
            rationale: decision.rationale,
            outcome: 'pending',
            source: 'system',
            raw_data: { decision, tier, full_autonomy: true },
          });
        } else {
          result.skipped++;
        }
      } else if (decision.action === 'QUEUE_FOR_APPROVAL') {
        result.queued++;
        await logAuditEvent({
          event_type: 'trade_queue_built',
          ticker: decision.ticker,
          action_taken: `QUEUED [Tier ${tier}]: ${decision.issue}`,
          rationale: decision.rationale,
          outcome: 'pending',
          source: 'system',
        });
      } else if (decision.action === 'NOTIFY') {
        const { error: alertError } = await supabase.from('position_alerts').insert({
          ticker: decision.ticker || 'SYSTEM',
          alert_type: 'drawdown_warning',
          message: `🤖 [T${tier}] ${decision.issue} — ${decision.rationale}`,
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
      tier,
      run_count: fresh_data.run_count,
      executed: result.executed,
      queued: result.queued,
      notified: result.notified,
      skipped: result.skipped,
      errors: result.errors,
      decisions: result.decisions.map((d) => ({
        action: d.action,
        issue: d.issue,
        rationale: d.rationale,
        ticker: d.ticker,
      })),
      platform_snapshot: status.slice(0, 500),
    },
    duration_ms: result.duration_ms,
    ran_at: result.ran_at,
  });
  if (cronError) console.error(cronError);

  return result;
}
