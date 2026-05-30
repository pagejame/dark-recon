export interface WeeklyAuditReport {
  week_start: string;
  week_end: string;
  generated_at: string;
  performance: {
    starting_equity: number;
    ending_equity: number;
    week_pnl: number;
    week_pnl_pct: number;
    total_pnl_vs_start: number;
    total_pnl_pct: number;
    best_day: string;
    worst_day: string;
  };
  trades: {
    total_executed: number;
    wins: number;
    losses: number;
    win_rate: number;
    avg_win_pct: number;
    avg_loss_pct: number;
    largest_win: { ticker: string; pnl: number };
    largest_loss: { ticker: string; pnl: number };
    by_signal_source: Record<string, { trades: number; wins: number; win_rate: number }>;
  };
  agent: {
    total_runs: number;
    total_actions: number;
    auto_executed: number;
    queued: number;
    notified: number;
    skipped: number;
    most_common_action: string;
    errors: number;
  };
  signals: {
    total_fired: number;
    high_conviction: number;
    acted_on: number;
    act_rate: number;
    executed: number;
    expired: number;
    pending: number;
    high_conviction_executed: number;
    by_type: Record<string, number>;
    top_tickers: string[];
  };
  risk_events: {
    stop_losses_triggered: number;
    rebalances_executed: number;
    correlation_warnings: number;
    alerts_escalated: number;
    positions_closed_by_stop: string[];
  };
  intelligence: {
    sweeps_run: number;
    high_value_signals: number;
    congressional_trades_reviewed: number;
    earnings_plays_queued: number;
  };
  raw_audit_events: Array<{
    event_type: string;
    ticker?: string | null;
    action_taken: string;
    event_at: string;
  }>;
  claude_analysis: string;
  recommendations: string[];
}

export function formatReportAsMarkdown(report: WeeklyAuditReport): string {
  return `# Dark Recon Weekly Audit Report
Week: ${new Date(report.week_start).toLocaleDateString()} – ${new Date(report.week_end).toLocaleDateString()}
Generated: ${new Date(report.generated_at).toLocaleString()}

## Performance
- Week P&L: ${report.performance.week_pnl >= 0 ? '+' : ''}$${report.performance.week_pnl.toFixed(2)} (${report.performance.week_pnl_pct.toFixed(2)}%)
- Portfolio Value: $${report.performance.ending_equity.toLocaleString()}
- Total P&L vs $100k start: ${report.performance.total_pnl_vs_start >= 0 ? '+' : ''}$${report.performance.total_pnl_vs_start.toFixed(2)}

## Trading
- Trades Executed: ${report.trades.total_executed}
- Win Rate: ${report.trades.win_rate.toFixed(1)}% (${report.trades.wins}W / ${report.trades.losses}L)
- Avg Win: +${report.trades.avg_win_pct.toFixed(2)}% | Avg Loss: ${report.trades.avg_loss_pct.toFixed(2)}%
- Largest Win: ${report.trades.largest_win.ticker} +$${report.trades.largest_win.pnl.toFixed(0)}
- Largest Loss: ${report.trades.largest_loss.ticker} -$${Math.abs(report.trades.largest_loss.pnl).toFixed(0)}

## Signal Sources
${Object.entries(report.trades.by_signal_source)
  .map(
    ([s, d]) => `- ${s}: ${d.trades} trades, ${d.win_rate.toFixed(0)}% win rate`
  )
  .join('\n')}

## Autonomous Agent
- Total Runs: ${report.agent.total_runs}
- Auto Executed: ${report.agent.auto_executed}
- Queued for Review: ${report.agent.queued}
- Errors: ${report.agent.errors}

## Risk Events
- Stop Losses Triggered: ${report.risk_events.stop_losses_triggered}
- Rebalances Executed: ${report.risk_events.rebalances_executed}
${report.risk_events.positions_closed_by_stop.length > 0 ? `- Positions Stopped Out: ${report.risk_events.positions_closed_by_stop.join(', ')}` : ''}

## Signals
- Total: ${report.signals.total_fired} | Executed: ${report.signals.executed} (${report.signals.act_rate.toFixed(1)}% act rate)
- Expired: ${report.signals.expired} | Still pending: ${report.signals.pending}
- High conviction: ${report.signals.high_conviction} (${report.signals.high_conviction_executed} executed)

## Intelligence
- Sweeps Run: ${report.intelligence.sweeps_run}
- Congressional Trades Reviewed: ${report.intelligence.congressional_trades_reviewed}
- Earnings Plays Queued: ${report.intelligence.earnings_plays_queued}

## Claude's Analysis
${report.claude_analysis}

## Recommendations for Next Week
${report.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

## Raw Audit Events (${report.raw_audit_events.length} total)
${report.raw_audit_events
  .slice(0, 50)
  .map(
    (e) =>
      `- [${e.event_type}] ${e.ticker || ''} ${e.action_taken} (${new Date(e.event_at).toLocaleString()})`
  )
  .join('\n')}
`;
}
