import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ALPACA_HEADERS = {
  'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
  'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET || '',
};

interface AlpacaPosition {
  symbol: string;
  unrealized_plpc?: string;
  market_value?: string;
}

interface AlpacaOrder {
  symbol: string;
  side: string;
  qty: string;
  limit_price?: string;
  status: string;
}

interface ScanTask {
  title: string;
  notes?: string;
  category?: string;
  priority?: number;
}

function generateFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/\$[\d,\.]+/g, '$X')
    .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE')
    .replace(/\d+/g, 'N')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

interface HandledEntry {
  title: string;
  action: string;
  result: string;
  message: string;
  when: string;
  fingerprint: string;
}

async function gatherPlatformStatus(): Promise<string> {
  const supabase = createAdminClient();
  const sections: string[] = [];

  try {
    const [posRes, ordRes, acctRes] = await Promise.all([
      fetch('https://paper-api.alpaca.markets/v2/positions', { headers: ALPACA_HEADERS }),
      fetch('https://paper-api.alpaca.markets/v2/orders?status=open', { headers: ALPACA_HEADERS }),
      fetch('https://paper-api.alpaca.markets/v2/account', { headers: ALPACA_HEADERS }),
    ]);

    const positions = posRes.ok ? ((await posRes.json()) as AlpacaPosition[]) : [];
    const orders = ordRes.ok ? ((await ordRes.json()) as AlpacaOrder[]) : [];
    const account = acctRes.ok ? ((await acctRes.json()) as Record<string, string>) : {};

    const equity = parseFloat(account.equity || '0');
    const cash = parseFloat(account.cash || '0');
    const cashPct = equity > 0 ? ((cash / equity) * 100).toFixed(1) : '0';

    sections.push(`PORTFOLIO:
Equity: $${equity.toLocaleString()}
Cash: $${cash.toLocaleString()} (${cashPct}%)
Open Positions: ${Array.isArray(positions) ? positions.length : 0}
${
  Array.isArray(positions)
    ? positions
        .map((p) => {
          const pnlPct = parseFloat(p.unrealized_plpc || '0') * 100;
          return `  ${p.symbol}: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% P&L, market value $${parseFloat(p.market_value || '0').toFixed(0)}`;
        })
        .join('\n')
    : ''
}
Pending Orders: ${Array.isArray(orders) ? orders.length : 0}
${
  Array.isArray(orders)
    ? orders
        .map(
          (o) =>
            `  ${o.symbol}: ${o.side} ${o.qty} @ $${o.limit_price} (${o.status})`
        )
        .join('\n')
    : ''
}`);
  } catch {
    sections.push('PORTFOLIO: Unable to fetch');
  }

  try {
    const { data: alerts } = await supabase
      .from('price_alerts')
      .select('*')
      .in('status', ['active', 'triggered']);

    const triggered = (alerts || []).filter((a) => a.status === 'triggered');
    const active = (alerts || []).filter((a) => a.status === 'active');

    sections.push(`PRICE ALERTS:
Triggered (not dismissed): ${triggered.length}
${triggered.map((a) => `  ${a.ticker} ${a.condition} $${a.target_price} — TRIGGERED`).join('\n')}
Active: ${active.length}
${active.map((a) => `  ${a.ticker} ${a.condition} $${a.target_price}`).join('\n')}`);
  } catch {
    sections.push('PRICE ALERTS: Unable to fetch');
  }

  try {
    const { data: queue } = await supabase
      .from('trade_queue')
      .select('*')
      .in('status', ['pending'])
      .order('queued_at', { ascending: false });

    sections.push(`TRADE QUEUE:
Pending trades awaiting approval: ${(queue || []).length}
${(queue || [])
  .map(
    (t) =>
      `  ${t.ticker}: ${t.instrument_type} ${t.direction} — conviction ${t.conviction_score}/10 — expires ${new Date(t.expires_at).toLocaleTimeString()}`
  )
  .join('\n')}`);
  } catch {
    sections.push('TRADE QUEUE: Unable to fetch');
  }

  try {
    const { data: posAlerts } = await supabase
      .from('position_alerts')
      .select('*')
      .eq('status', 'active')
      .order('fired_at', { ascending: false })
      .limit(10);

    sections.push(`POSITION ALERTS:
Active alerts: ${(posAlerts || []).length}
${(posAlerts || [])
  .map((a) => `  [${String(a.severity).toUpperCase()}] ${a.ticker}: ${a.message}`)
  .join('\n')}`);
  } catch {
    sections.push('POSITION ALERTS: Unable to fetch');
  }

  try {
    const { data: cronRuns } = await supabase
      .from('cron_runs')
      .select('*')
      .order('ran_at', { ascending: false })
      .limit(20);

    const jobMap: Record<string, { job_name: string; status: string; ran_at: string }> = {};
    (cronRuns || []).forEach((r) => {
      if (!jobMap[r.job_name]) jobMap[r.job_name] = r;
    });

    sections.push(`CRON JOB STATUS:
${
  Object.entries(jobMap)
    .map(([, run]) => {
      const hoursAgo = Math.floor(
        (Date.now() - new Date(run.ran_at).getTime()) / (1000 * 60 * 60)
      );
      return `  ${run.job_name}: ${run.status} (${hoursAgo}h ago)`;
    })
    .join('\n') || '  No cron runs recorded yet'
}`);
  } catch {
    sections.push('CRON JOBS: Unable to fetch');
  }

  try {
    const { data: stopAlerts } = await supabase
      .from('price_alerts')
      .select('ticker')
      .eq('status', 'active')
      .eq('condition', 'below');

    const protectedTickers = new Set((stopAlerts || []).map((a) => a.ticker));

    const posRes = await fetch('https://paper-api.alpaca.markets/v2/positions', {
      headers: ALPACA_HEADERS,
    });
    const positions = posRes.ok ? ((await posRes.json()) as AlpacaPosition[]) : [];
    const unprotected = (Array.isArray(positions) ? positions : [])
      .filter((p) => !protectedTickers.has(p.symbol))
      .map((p) => p.symbol);

    sections.push(`STOP LOSS AUDIT:
Positions without stop loss alerts: ${unprotected.length}
${unprotected.length > 0 ? `  Unprotected: ${unprotected.join(', ')}` : '  All positions protected'}`);
  } catch {
    sections.push('STOP LOSS AUDIT: Unable to fetch');
  }

  try {
    const { data: autopilot } = await supabase
      .from('autopilot_reports')
      .select('action_items, overall_action')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (autopilot?.action_items) {
      const items = Array.isArray(autopilot.action_items) ? autopilot.action_items : [];
      const highPriority = items.filter(
        (i: { priority?: string }) => i.priority === 'high'
      );
      sections.push(`AUTOPILOT (today's unaddressed actions):
Overall stance: ${autopilot.overall_action}
High priority actions: ${highPriority.length}
${highPriority
  .map((i: { ticker?: string; action?: string }) => `  ${i.ticker || ''}: ${i.action}`)
  .join('\n')}`);
    }
  } catch {
    // skip
  }

  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: signals } = await supabase
      .from('signals')
      .select('ticker, signal_type, strength, status')
      .eq('strength', 'high')
      .eq('status', 'pending')
      .gte('created_at', yesterday);

    sections.push(`UNACTED HIGH CONVICTION SIGNALS:
${
  (signals || []).length > 0
    ? (signals || []).map((s) => `  ${s.ticker}: ${s.signal_type}`).join('\n')
    : '  None pending'
}`);
  } catch {
    // skip
  }

  return sections.join('\n\n');
}

export const maxDuration = 60;

export async function POST(_request: NextRequest) {
  try {
    const supabase = createAdminClient();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: executionLog } = await supabase
      .from('task_execution_log')
      .select('task_title, action_label, result, result_message, issue_fingerprint, executed_at')
      .gte('executed_at', thirtyDaysAgo)
      .order('executed_at', { ascending: false })
      .limit(50);

    const recentlyHandled: HandledEntry[] = (executionLog || []).map((log) => ({
      title: log.task_title,
      action: log.action_label,
      result: log.result,
      message: log.result_message || '',
      when: new Date(log.executed_at).toLocaleDateString(),
      fingerprint: log.issue_fingerprint || generateFingerprint(log.task_title),
    }));

    const handledFingerprints = new Set(
      recentlyHandled.filter((h) => h.result === 'success').map((h) => h.fingerprint)
    );

    const platformStatus = await gatherPlatformStatus();

    const { data: existingTasks } = await supabase
      .from('tasks')
      .select('title')
      .neq('status', 'done');

    const existingTitles = (existingTasks || []).map((t) => t.title.toLowerCase());

    const handledContext =
      recentlyHandled.length > 0
        ? `RECENTLY HANDLED (do NOT re-create these unless the situation has materially changed):
${recentlyHandled.map((h) => `  [${h.result.toUpperCase()}] ${h.title} — ${h.action} on ${h.when}: ${h.message}`).join('\n')}`
        : 'No recently handled tasks.';

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `You are Dark Recon's platform scanner. Analyze the current platform status and generate a list of specific actionable tasks that need to be completed right now.

CURRENT PLATFORM STATUS:
${platformStatus}

EXISTING TASKS (don't duplicate these):
${existingTitles.join('\n') || 'none'}

${handledContext}

Generate ONLY tasks that are genuinely needed right now based on the data above. Be specific and actionable.

IMPORTANT: Do NOT create tasks for issues that appear in RECENTLY HANDLED unless:
1. The same issue has recurred (e.g. new triggered alerts after previous ones were dismissed)
2. A previous action failed and needs to be retried
3. Conditions have materially changed since it was last handled

If you skip a potential task because it was recently handled, that is correct behavior.
Return [] if all detected issues were recently handled.

Return ONLY valid JSON array, no markdown:
[
  {
    "title": "Cancel pending XLE limit order — expiring soon",
    "notes": "XLE limit order at $91 has been pending. Cancel before it fills at wrong price.",
    "category": "urgent",
    "priority": 1
  },
  {
    "title": "Set stop loss on NVDA position",
    "notes": "NVDA is unprotected — no stop loss alert set. Entry at $217.30, suggest stop at $202.",
    "category": "trading",
    "priority": 1
  }
]

Categories: urgent, platform, trading, research, general
Priority: 1=high, 2=medium, 3=low

Only generate tasks for real issues found in the data. If everything looks fine, return [].
Maximum 8 tasks per scan.`,
        },
      ],
    });

    const raw = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('');
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');

    if (start === -1 || end === -1) {
      const skippedCount = recentlyHandled.filter((h) => h.result === 'success').length;
      return NextResponse.json({
        created: 0,
        tasks: [],
        skipped_handled: skippedCount,
        message:
          skippedCount > 0
            ? `✓ Scan complete — all detected issues were recently handled (${skippedCount} skipped)`
            : 'No tasks needed — platform looks healthy',
      });
    }

    const newTasks = JSON.parse(raw.slice(start, end + 1)) as ScanTask[];

    if (!Array.isArray(newTasks) || newTasks.length === 0) {
      const skippedCount = recentlyHandled.filter((h) => h.result === 'success').length;
      return NextResponse.json({
        created: 0,
        tasks: [],
        skipped_handled: skippedCount,
        message:
          skippedCount > 0
            ? `✓ Scan complete — all detected issues were recently handled (${skippedCount} skipped)`
            : '✓ Platform scan complete — no new tasks needed',
      });
    }

    const created = [];
    for (const task of newTasks.slice(0, 8)) {
      if (!task.title) continue;

      const fingerprint = generateFingerprint(task.title);

      if (handledFingerprints.has(fingerprint)) continue;

      const isDuplicate = existingTitles.some(
        (existing) =>
          existing.includes(task.title.toLowerCase().slice(0, 20)) ||
          task.title.toLowerCase().includes(existing.slice(0, 20))
      );

      if (isDuplicate) continue;

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          title: task.title,
          notes: task.notes || null,
          category: task.category || 'general',
          priority: task.priority || 2,
          status: 'pending',
          issue_fingerprint: fingerprint,
        })
        .select()
        .single();

      if (!error && data) created.push(data);
    }

    const skippedCount = recentlyHandled.filter((h) => h.result === 'success').length;

    return NextResponse.json({
      created: created.length,
      tasks: created,
      skipped_handled: skippedCount,
      message:
        created.length > 0
          ? `✓ Scan complete — ${created.length} new task${created.length > 1 ? 's' : ''} added${skippedCount > 0 ? `, ${skippedCount} previously handled items skipped` : ''}`
          : skippedCount > 0
            ? `✓ Scan complete — all detected issues were recently handled (${skippedCount} skipped)`
            : '✓ Scan complete — no issues found',
      platform_status: platformStatus,
    });
  } catch (error) {
    console.error('Site scan error:', error);
    return NextResponse.json({ error: 'Scan failed', created: 0 }, { status: 500 });
  }
}
