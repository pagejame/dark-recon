import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAccount } from '@/lib/api/alpaca';
import { Resend } from 'resend';
import type { WeeklyAuditReport } from '@/lib/services/weekly-audit-format';

export type { WeeklyAuditReport } from '@/lib/services/weekly-audit-format';
export { formatReportAsMarkdown } from '@/lib/services/weekly-audit-format';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const EMAIL = process.env.DARK_RECON_EMAIL || 'pagejame@gmail.com';

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');
  return new Resend(apiKey);
}

interface AuditEventRow {
  event_type: string;
  ticker?: string | null;
  action_taken: string;
  outcome?: string | null;
  pnl_pct?: number | null;
  pnl_dollar?: number | null;
  signal_sources?: string[] | null;
  event_at: string;
}

interface CronRunRow {
  status: string;
  results?: {
    executed?: number;
    queued?: number;
    notified?: number;
    skipped?: number;
    errors?: string[];
  } | null;
}

interface SnapshotRow {
  snapshot_date: string;
  day_pnl?: number | null;
}

async function generateClaudeAnalysis(
  reportData: Omit<WeeklyAuditReport, 'claude_analysis' | 'recommendations'>
): Promise<{ analysis: string; recommendations: string[] }> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `You are analyzing Dark Recon's autonomous trading performance for the week of ${reportData.week_start} to ${reportData.week_end}.

WEEKLY PERFORMANCE SUMMARY:
Portfolio P&L: ${reportData.performance.week_pnl >= 0 ? '+' : ''}$${reportData.performance.week_pnl.toFixed(2)} (${reportData.performance.week_pnl_pct >= 0 ? '+' : ''}${reportData.performance.week_pnl_pct.toFixed(2)}%)
Total since start: ${reportData.performance.total_pnl_vs_start >= 0 ? '+' : ''}$${reportData.performance.total_pnl_vs_start.toFixed(2)} (${reportData.performance.total_pnl_pct.toFixed(2)}%)

TRADING ACTIVITY:
Trades executed: ${reportData.trades.total_executed}
Win rate: ${reportData.trades.win_rate.toFixed(1)}% (${reportData.trades.wins}W / ${reportData.trades.losses}L)
Avg win: +${reportData.trades.avg_win_pct.toFixed(2)}% | Avg loss: ${reportData.trades.avg_loss_pct.toFixed(2)}%
Largest win: ${reportData.trades.largest_win.ticker} +$${reportData.trades.largest_win.pnl.toFixed(0)}
Largest loss: ${reportData.trades.largest_loss.ticker} -$${Math.abs(reportData.trades.largest_loss.pnl).toFixed(0)}

By signal source:
${Object.entries(reportData.trades.by_signal_source)
  .map(
    ([source, data]) => `  ${source}: ${data.trades} trades, ${data.win_rate.toFixed(0)}% win rate`
  )
  .join('\n')}

AUTONOMOUS AGENT:
Runs: ${reportData.agent.total_runs}
Actions taken: ${reportData.agent.auto_executed} executed, ${reportData.agent.queued} queued, ${reportData.agent.notified} flagged
Errors: ${reportData.agent.errors}

RISK EVENTS:
Stop losses triggered: ${reportData.risk_events.stop_losses_triggered}
Rebalances executed: ${reportData.risk_events.rebalances_executed}
Alert escalations: ${reportData.risk_events.alerts_escalated}
${reportData.risk_events.positions_closed_by_stop.length > 0 ? `Positions stopped out: ${reportData.risk_events.positions_closed_by_stop.join(', ')}` : ''}

SIGNALS:
Total fired: ${reportData.signals.total_fired}
High conviction: ${reportData.signals.high_conviction}
Acted on: ${reportData.signals.acted_on} (${reportData.signals.act_rate.toFixed(1)}% act rate)
Top tickers mentioned: ${reportData.signals.top_tickers.join(', ')}

Provide:
1. A 3-4 paragraph analysis of this week's performance — what worked, what didn't, patterns you see
2. Specific improvement recommendations for next week

Format your response as JSON:
{
  "analysis": "Full analysis paragraphs here...",
  "recommendations": [
    "Specific recommendation 1",
    "Specific recommendation 2",
    "Specific recommendation 3"
  ]
}`,
      },
    ],
  });

  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return {
      analysis: parsed.analysis || 'Analysis unavailable',
      recommendations: parsed.recommendations || [],
    };
  } catch {
    return {
      analysis: raw,
      recommendations: [],
    };
  }
}

export async function generateWeeklyAuditReport(): Promise<WeeklyAuditReport> {
  const supabase = createAdminClient();
  const weekEnd = new Date();
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weekStartStr = weekStart.toISOString();
  const weekEndStr = weekEnd.toISOString();

  const { data: auditEvents } = await supabase
    .from('audit_log')
    .select('*')
    .gte('event_at', weekStartStr)
    .order('event_at', { ascending: true });

  const events = (auditEvents || []) as AuditEventRow[];

  const performance = {
    starting_equity: 100000,
    ending_equity: 100000,
    week_pnl: 0,
    week_pnl_pct: 0,
    total_pnl_vs_start: 0,
    total_pnl_pct: 0,
    best_day: 'N/A',
    worst_day: 'N/A',
  };

  try {
    const account = await getAccount();
    const equity = parseFloat((account as { equity?: string })?.equity || '100000');
    const lastEquity = parseFloat(
      (account as { last_equity?: string })?.last_equity || equity.toString()
    );
    performance.ending_equity = equity;
    performance.week_pnl = equity - lastEquity;
    performance.week_pnl_pct = lastEquity > 0 ? ((equity - lastEquity) / lastEquity) * 100 : 0;
    performance.total_pnl_vs_start = equity - 100000;
    performance.total_pnl_pct = ((equity - 100000) / 100000) * 100;
  } catch {
    /* use defaults */
  }

  const { data: snapshots } = await supabase
    .from('strategy_snapshots')
    .select('*')
    .gte('snapshot_date', weekStart.toISOString().split('T')[0])
    .order('day_pnl', { ascending: false });

  const snapshotRows = (snapshots || []) as SnapshotRow[];
  if (snapshotRows.length > 0) {
    performance.best_day = snapshotRows[0]?.snapshot_date || 'N/A';
    performance.worst_day = snapshotRows[snapshotRows.length - 1]?.snapshot_date || 'N/A';
  }

  const tradeEvents = events.filter((e) =>
    ['trade_executed', 'trade_approved'].includes(e.event_type)
  );
  const wins = events.filter((e) => e.outcome === 'win');
  const losses = events.filter((e) => e.outcome === 'loss');

  const avgWinPct =
    wins.length > 0 ? wins.reduce((sum, e) => sum + (e.pnl_pct || 0), 0) / wins.length : 0;
  const avgLossPct =
    losses.length > 0 ? losses.reduce((sum, e) => sum + (e.pnl_pct || 0), 0) / losses.length : 0;

  const bySignalSource: Record<string, { trades: number; wins: number; win_rate: number }> = {};
  tradeEvents.forEach((e) => {
    const sources = e.signal_sources || ['Unknown'];
    sources.slice(0, 1).forEach((source: string) => {
      const key = source.split(' — ')[0].trim();
      if (!bySignalSource[key]) bySignalSource[key] = { trades: 0, wins: 0, win_rate: 0 };
      bySignalSource[key].trades++;
      if (e.outcome === 'win') bySignalSource[key].wins++;
    });
  });
  Object.keys(bySignalSource).forEach((key) => {
    const s = bySignalSource[key];
    s.win_rate = s.trades > 0 ? (s.wins / s.trades) * 100 : 0;
  });

  const pnlEvents = events.filter((e) => e.pnl_dollar !== null && e.pnl_dollar !== undefined);
  const sortedByPnL = [...pnlEvents].sort(
    (a, b) => (b.pnl_dollar || 0) - (a.pnl_dollar || 0)
  );
  const largestWin = sortedByPnL[0] || { ticker: 'N/A', pnl_dollar: 0 };
  const largestLoss = sortedByPnL[sortedByPnL.length - 1] || { ticker: 'N/A', pnl_dollar: 0 };

  const { data: agentRuns } = await supabase
    .from('cron_runs')
    .select('*')
    .eq('job_name', 'autonomous-agent')
    .gte('ran_at', weekStartStr);

  const agentRunsData = (agentRuns || []) as CronRunRow[];
  const totalAutoExecuted = agentRunsData.reduce(
    (sum, r) => sum + (r.results?.executed || 0),
    0
  );
  const totalQueued = agentRunsData.reduce((sum, r) => sum + (r.results?.queued || 0), 0);
  const totalNotified = agentRunsData.reduce((sum, r) => sum + (r.results?.notified || 0), 0);
  const totalSkipped = agentRunsData.reduce((sum, r) => sum + (r.results?.skipped || 0), 0);
  const totalErrors = agentRunsData.filter(
    (r) => r.status === 'failed' || (r.results?.errors?.length || 0) > 0
  ).length;

  const stopEvents = events.filter((e) => e.event_type === 'stop_loss_triggered');
  const rebalanceEvents = events.filter((e) => e.event_type === 'rebalance_triggered');
  const { data: escalations } = await supabase
    .from('cron_runs')
    .select('*')
    .eq('job_name', 'position-monitor')
    .gte('ran_at', weekStartStr);

  const { data: signals } = await supabase
    .from('signals')
    .select('*')
    .gte('created_at', weekStartStr);

  const allSignals = signals || [];
  const highConviction = allSignals.filter((s: { strength: string }) => s.strength === 'high');
  const actedOn = allSignals.filter((s: { status: string }) =>
    ['confirmed', 'executed'].includes(s.status)
  );
  const tickerCounts: Record<string, number> = {};
  allSignals.forEach((s: { ticker?: string }) => {
    if (s.ticker) tickerCounts[s.ticker] = (tickerCounts[s.ticker] || 0) + 1;
  });
  const topTickers = Object.entries(tickerCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([ticker]) => ticker);

  const byType: Record<string, number> = {};
  allSignals.forEach((s: { signal_type: string }) => {
    byType[s.signal_type] = (byType[s.signal_type] || 0) + 1;
  });

  const { data: intelRuns } = await supabase
    .from('cron_runs')
    .select('*')
    .eq('job_name', 'intelligence-sweep')
    .gte('ran_at', weekStartStr);

  const congressEvents = events.filter((e) => e.event_type === 'congressional_trade_reviewed');
  const earningsEvents = events.filter((e) => e.event_type === 'earnings_play_queued');

  const reportData: Omit<WeeklyAuditReport, 'claude_analysis' | 'recommendations'> = {
    week_start: weekStartStr,
    week_end: weekEndStr,
    generated_at: new Date().toISOString(),
    performance,
    trades: {
      total_executed: tradeEvents.length,
      wins: wins.length,
      losses: losses.length,
      win_rate:
        tradeEvents.length > 0
          ? (wins.length / Math.max(1, wins.length + losses.length)) * 100
          : 0,
      avg_win_pct: avgWinPct * 100,
      avg_loss_pct: avgLossPct * 100,
      largest_win: { ticker: largestWin.ticker || 'N/A', pnl: largestWin.pnl_dollar || 0 },
      largest_loss: { ticker: largestLoss.ticker || 'N/A', pnl: largestLoss.pnl_dollar || 0 },
      by_signal_source: bySignalSource,
    },
    agent: {
      total_runs: agentRunsData.length,
      total_actions: totalAutoExecuted + totalQueued + totalNotified,
      auto_executed: totalAutoExecuted,
      queued: totalQueued,
      notified: totalNotified,
      skipped: totalSkipped,
      most_common_action: 'auto_execute',
      errors: totalErrors,
    },
    signals: {
      total_fired: allSignals.length,
      high_conviction: highConviction.length,
      acted_on: actedOn.length,
      act_rate: allSignals.length > 0 ? (actedOn.length / allSignals.length) * 100 : 0,
      by_type: byType,
      top_tickers: topTickers,
    },
    risk_events: {
      stop_losses_triggered: stopEvents.length,
      rebalances_executed: rebalanceEvents.length,
      correlation_warnings: 0,
      alerts_escalated: escalations?.length || 0,
      positions_closed_by_stop: stopEvents
        .map((e) => e.ticker)
        .filter(Boolean) as string[],
    },
    intelligence: {
      sweeps_run: intelRuns?.length || 0,
      high_value_signals: highConviction.length,
      congressional_trades_reviewed: congressEvents.length,
      earnings_plays_queued: earningsEvents.length,
    },
    raw_audit_events: events,
  };

  const { analysis, recommendations } = await generateClaudeAnalysis(reportData);

  return { ...reportData, claude_analysis: analysis, recommendations };
}

export async function sendWeeklyAuditEmail(report: WeeklyAuditReport): Promise<void> {
  const resend = getResendClient();
  const weekLabel = `${new Date(report.week_start).toLocaleDateString()} – ${new Date(report.week_end).toLocaleDateString()}`;
  const pnlColor = report.performance.week_pnl >= 0 ? '#00ff88' : '#ff3d5a';
  const pnlSign = report.performance.week_pnl >= 0 ? '+' : '';

  const recRows = report.recommendations
    .map(
      (r) => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #1e2a3a;font-size:13px;color:#e8edf5;line-height:1.6;">
        → ${r}
      </td>
    </tr>`
    )
    .join('');

  const signalRows = Object.entries(report.signals.by_type)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(
      ([type, count]) => `
    <tr>
      <td style="padding:6px 12px;font-family:monospace;font-size:10px;color:#7a8fa8;">${type.replace(/_/g, ' ').toUpperCase()}</td>
      <td style="padding:6px 12px;font-family:monospace;font-size:11px;color:#e8edf5;">${count}</td>
    </tr>`
    )
    .join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#080a0f;font-family:'DM Sans',system-ui,sans-serif;color:#e8edf5;">
<div style="max-width:600px;margin:0 auto;padding:32px 20px;">

  <div style="font-family:monospace;font-size:9px;letter-spacing:4px;color:#00ff88;margin-bottom:6px;">◆ DARK RECON</div>
  <h1 style="font-size:22px;font-weight:800;color:#e8edf5;margin:0 0 4px;">Weekly Audit Report</h1>
  <div style="font-family:monospace;font-size:10px;color:#7a8fa8;margin-bottom:28px;">${weekLabel}</div>

  <div style="background:#111620;border:1px solid #1e2a3a;border-left:3px solid ${pnlColor};border-radius:10px;padding:20px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
    <div>
      <div style="font-family:monospace;font-size:8px;letter-spacing:3px;color:#7a8fa8;margin-bottom:6px;">WEEK P&L</div>
      <div style="font-family:monospace;font-size:36px;font-weight:700;color:${pnlColor};">${pnlSign}$${report.performance.week_pnl.toFixed(2)}</div>
      <div style="font-family:monospace;font-size:12px;color:${pnlColor};">${pnlSign}${report.performance.week_pnl_pct.toFixed(2)}% this week</div>
    </div>
    <div style="text-align:right;">
      <div style="font-family:monospace;font-size:8px;letter-spacing:3px;color:#7a8fa8;margin-bottom:6px;">PORTFOLIO</div>
      <div style="font-family:monospace;font-size:24px;font-weight:700;color:#e8edf5;">$${report.performance.ending_equity.toLocaleString()}</div>
      <div style="font-family:monospace;font-size:11px;color:${report.performance.total_pnl_vs_start >= 0 ? '#00ff88' : '#ff3d5a'};">
        ${report.performance.total_pnl_vs_start >= 0 ? '+' : ''}$${report.performance.total_pnl_vs_start.toFixed(2)} total vs $100k start
      </div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
    <div style="background:#111620;border:1px solid #1e2a3a;border-radius:8px;padding:14px;">
      <div style="font-family:monospace;font-size:8px;letter-spacing:2px;color:#7a8fa8;margin-bottom:6px;">WIN RATE</div>
      <div style="font-family:monospace;font-size:22px;font-weight:700;color:${report.trades.win_rate >= 50 ? '#00ff88' : '#ff3d5a'};">${report.trades.win_rate.toFixed(1)}%</div>
      <div style="font-family:monospace;font-size:10px;color:#3d5068;">${report.trades.wins}W / ${report.trades.losses}L of ${report.trades.total_executed} trades</div>
    </div>
    <div style="background:#111620;border:1px solid #1e2a3a;border-radius:8px;padding:14px;">
      <div style="font-family:monospace;font-size:8px;letter-spacing:2px;color:#7a8fa8;margin-bottom:6px;">AGENT RUNS</div>
      <div style="font-family:monospace;font-size:22px;font-weight:700;color:#3d9aff;">${report.agent.total_runs}</div>
      <div style="font-family:monospace;font-size:10px;color:#3d5068;">${report.agent.auto_executed} executed · ${report.agent.errors} errors</div>
    </div>
    <div style="background:#111620;border:1px solid #1e2a3a;border-radius:8px;padding:14px;">
      <div style="font-family:monospace;font-size:8px;letter-spacing:2px;color:#7a8fa8;margin-bottom:6px;">SIGNALS</div>
      <div style="font-family:monospace;font-size:22px;font-weight:700;color:#ffd700;">${report.signals.total_fired}</div>
      <div style="font-family:monospace;font-size:10px;color:#3d5068;">${report.signals.high_conviction} high conviction · ${report.signals.act_rate.toFixed(0)}% act rate</div>
    </div>
    <div style="background:#111620;border:1px solid #1e2a3a;border-radius:8px;padding:14px;">
      <div style="font-family:monospace;font-size:8px;letter-spacing:2px;color:#7a8fa8;margin-bottom:6px;">RISK EVENTS</div>
      <div style="font-family:monospace;font-size:22px;font-weight:700;color:${report.risk_events.stop_losses_triggered > 0 ? '#ffd700' : '#00ff88'};">${report.risk_events.stop_losses_triggered}</div>
      <div style="font-family:monospace;font-size:10px;color:#3d5068;">stops triggered · ${report.risk_events.rebalances_executed} rebalances</div>
    </div>
  </div>

  <div style="background:#111620;border:1px solid #1e2a3a;border-left:3px solid #9b5de5;border-radius:10px;padding:20px;margin-bottom:16px;">
    <div style="font-family:monospace;font-size:8px;letter-spacing:3px;color:#9b5de5;margin-bottom:12px;">CLAUDE ANALYSIS</div>
    <div style="font-size:13px;color:#e8edf5;line-height:1.8;white-space:pre-wrap;">${report.claude_analysis}</div>
  </div>

  ${
    report.recommendations.length > 0
      ? `
  <div style="background:#111620;border:1px solid #1e2a3a;border-radius:10px;overflow:hidden;margin-bottom:16px;">
    <div style="padding:12px 16px;border-bottom:1px solid #1e2a3a;font-family:monospace;font-size:8px;letter-spacing:3px;color:#ffd700;">RECOMMENDATIONS FOR NEXT WEEK</div>
    <table style="width:100%;border-collapse:collapse;">${recRows}</table>
  </div>`
      : ''
  }

  ${
    signalRows
      ? `
  <div style="background:#111620;border:1px solid #1e2a3a;border-radius:10px;overflow:hidden;margin-bottom:16px;">
    <div style="padding:12px 16px;border-bottom:1px solid #1e2a3a;font-family:monospace;font-size:8px;letter-spacing:3px;color:#7a8fa8;">SIGNAL TYPE BREAKDOWN</div>
    <table style="width:100%;border-collapse:collapse;">${signalRows}</table>
  </div>`
      : ''
  }

  ${
    report.signals.top_tickers.length > 0
      ? `
  <div style="background:#111620;border:1px solid #1e2a3a;border-radius:8px;padding:14px;margin-bottom:16px;">
    <div style="font-family:monospace;font-size:8px;letter-spacing:3px;color:#7a8fa8;margin-bottom:8px;">MOST MENTIONED TICKERS</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${report.signals.top_tickers.map((t) => `<span style="font-family:monospace;font-size:11px;color:#ffd700;background:#ffd70015;border:1px solid #ffd70030;padding:4px 10px;border-radius:20px;">${t}</span>`).join('')}
    </div>
  </div>`
      : ''
  }

  <div style="text-align:center;margin-bottom:24px;">
    <a href="https://dark-recon.com/audit" style="display:inline-block;padding:12px 32px;background:#00ff88;color:#080a0f;border-radius:8px;font-family:monospace;font-size:11px;letter-spacing:2px;font-weight:700;text-decoration:none;margin-right:10px;">
      VIEW FULL AUDIT LOG →
    </a>
    <a href="https://dark-recon.com/analytics/reports" style="display:inline-block;padding:12px 32px;background:transparent;border:1px solid #1e2a3a;color:#7a8fa8;border-radius:8px;font-family:monospace;font-size:11px;letter-spacing:2px;text-decoration:none;">
      WEEKLY REPORTS →
    </a>
  </div>

  <div style="text-align:center;font-family:monospace;font-size:8px;color:#3d5068;letter-spacing:2px;">
    DARK RECON ALPHA · WEEKLY AUDIT REPORT
  </div>

</div>
</body>
</html>`;

  await resend.emails.send({
    from: 'Dark Recon <autopilot@dark-recon.com>',
    to: EMAIL,
    subject: `Dark Recon Weekly Audit: ${pnlSign}$${report.performance.week_pnl.toFixed(2)} · ${report.trades.win_rate.toFixed(0)}% win rate · ${weekLabel}`,
    html,
  });
}

export async function saveWeeklyAuditReport(report: WeeklyAuditReport): Promise<string> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('weekly_audit_reports')
    .insert({
      week_start: report.week_start,
      week_end: report.week_end,
      report_data: report,
      claude_analysis: report.claude_analysis,
      recommendations: report.recommendations,
      performance_summary: report.performance,
      generated_at: report.generated_at,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
}
