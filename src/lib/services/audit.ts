import { createAdminClient } from '@/lib/supabase/admin';

export type AuditEventType =
  | 'trade_executed'
  | 'trade_approved'
  | 'trade_rejected'
  | 'trade_queue_built'
  | 'signal_fired'
  | 'signal_confirmed'
  | 'signal_passed'
  | 'autopilot_generated'
  | 'autopilot_action_taken'
  | 'congressional_trade_reviewed'
  | 'intelligence_signal_acted'
  | 'stop_loss_triggered'
  | 'stop_loss_created'
  | 'price_alert_triggered'
  | 'price_alert_created'
  | 'position_opened'
  | 'position_closed'
  | 'position_peak_pnl'
  | 'site_scan_run'
  | 'task_executed'
  | 'manual_override'
  | 'rebalance_triggered'
  | 'earnings_play_queued'
  | 'system_health_checked'
  | 'circuit_breaker_triggered'
  | 'trading_mode_changed'
  | 'eod_force_close'
  | 'profit_target_hit'
  | 'stop_loss_cut'
  | 'trailing_stop_updated';

export interface AuditEntry {
  event_type: AuditEventType;
  ticker?: string;
  action_taken: string;
  rationale?: string;
  price_at_action?: number;
  quantity?: number;
  dollar_amount?: number;
  portfolio_value_at_action?: number;
  signal_sources?: string[];
  conviction_score?: number;
  congressional_data?: Record<string, unknown>;
  intelligence_data?: Record<string, unknown>;
  autopilot_recommendation?: string;
  outcome?: 'win' | 'loss' | 'neutral' | 'pending' | 'not_applicable';
  outcome_notes?: string;
  pnl_dollar?: number;
  pnl_pct?: number;
  source?: 'system' | 'user' | 'autopilot' | 'cron';
  session_context?: string;
  raw_data?: Record<string, unknown>;
}

export async function logAuditEvent(entry: AuditEntry): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from('audit_log').insert({
      event_type: entry.event_type,
      ticker: entry.ticker || null,
      action_taken: entry.action_taken,
      rationale: entry.rationale || null,
      price_at_action: entry.price_at_action || null,
      quantity: entry.quantity || null,
      dollar_amount: entry.dollar_amount || null,
      portfolio_value_at_action: entry.portfolio_value_at_action || null,
      signal_sources: entry.signal_sources || [],
      conviction_score: entry.conviction_score || null,
      congressional_data: entry.congressional_data || null,
      intelligence_data: entry.intelligence_data || null,
      autopilot_recommendation: entry.autopilot_recommendation || null,
      outcome: entry.outcome || 'pending',
      pnl_dollar: entry.pnl_dollar ?? null,
      pnl_pct: entry.pnl_pct ?? null,
      source: entry.source || 'system',
      session_context: entry.session_context || null,
      raw_data: entry.raw_data || null,
      event_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Audit log error (non-fatal):', e);
  }
}

export const audit = {
  tradeExecuted: (params: {
    ticker: string;
    action: string;
    price: number;
    quantity: number;
    dollarAmount: number;
    rationale: string;
    signalSources?: string[];
    convictionScore?: number;
    portfolioValue?: number;
    rawData?: Record<string, unknown>;
  }) =>
    logAuditEvent({
      event_type: 'trade_executed',
      ticker: params.ticker,
      action_taken: params.action,
      rationale: params.rationale,
      price_at_action: params.price,
      quantity: params.quantity,
      dollar_amount: params.dollarAmount,
      portfolio_value_at_action: params.portfolioValue,
      signal_sources: params.signalSources,
      conviction_score: params.convictionScore,
      outcome: 'pending',
      source: 'user',
      raw_data: params.rawData,
    }),

  tradeApproved: (params: {
    ticker: string;
    instrument: string;
    price?: number;
    quantity?: number;
    dollarAmount?: number;
    convictionScore?: number;
    thesis: string;
    catalyst: string;
    signalSources?: string[];
    portfolioValue?: number;
  }) =>
    logAuditEvent({
      event_type: 'trade_approved',
      ticker: params.ticker,
      action_taken: `APPROVED: ${params.instrument} ${params.ticker} — ${params.quantity} units at $${params.price}`,
      rationale: `${params.thesis} | Catalyst: ${params.catalyst}`,
      price_at_action: params.price,
      quantity: params.quantity,
      dollar_amount: params.dollarAmount,
      portfolio_value_at_action: params.portfolioValue,
      signal_sources: params.signalSources,
      conviction_score: params.convictionScore,
      outcome: 'pending',
      source: 'user',
    }),

  tradeRejected: (params: {
    ticker: string;
    reason: string;
    convictionScore?: number;
  }) =>
    logAuditEvent({
      event_type: 'trade_rejected',
      ticker: params.ticker,
      action_taken: `REJECTED: ${params.ticker} trade queue entry`,
      rationale: params.reason,
      conviction_score: params.convictionScore,
      outcome: 'not_applicable',
      source: 'user',
    }),

  stopLossTriggered: (params: {
    ticker: string;
    stopPrice: number;
    currentPrice: number;
    pnlDollar?: number;
    pnlPct?: number;
    autoClose: boolean;
  }) =>
    logAuditEvent({
      event_type: 'stop_loss_triggered',
      ticker: params.ticker,
      action_taken: `STOP LOSS ${params.autoClose ? 'AUTO-CLOSED' : 'ALERT FIRED'}: ${params.ticker} at $${params.currentPrice} (stop: $${params.stopPrice})`,
      rationale: `Stop loss level breached. ${params.autoClose ? 'Position auto-closed per settings.' : 'Alert fired for manual review.'}`,
      price_at_action: params.currentPrice,
      pnl_dollar: params.pnlDollar,
      pnl_pct: params.pnlPct,
      outcome: params.pnlDollar !== undefined && params.pnlDollar >= 0 ? 'win' : 'loss',
      source: 'system',
    }),

  congressionalTradeReviewed: (params: {
    representative: string;
    ticker: string;
    tradeType: string;
    amount: string;
    influencedDecision: boolean;
    notes?: string;
  }) =>
    logAuditEvent({
      event_type: 'congressional_trade_reviewed',
      ticker: params.ticker,
      action_taken: `CONGRESSIONAL TRADE REVIEWED: ${params.representative} — ${params.tradeType} ${params.ticker} (${params.amount})`,
      rationale:
        params.notes ||
        `Congressional disclosure reviewed. ${params.influencedDecision ? 'Influenced trading decision.' : 'Noted, no action taken.'}`,
      congressional_data: params,
      outcome: 'not_applicable',
      source: 'system',
    }),

  siteScanned: (params: {
    tasksCreated: number;
    tasksSkipped: number;
    issuesFound: string[];
    actionsExecuted: string[];
  }) =>
    logAuditEvent({
      event_type: 'site_scan_run',
      action_taken: `SITE SCAN: ${params.tasksCreated} tasks created, ${params.tasksSkipped} skipped`,
      rationale: `Issues found: ${params.issuesFound.join(', ') || 'none'}. Actions executed: ${params.actionsExecuted.join(', ') || 'none'}`,
      outcome: 'not_applicable',
      source: 'user',
      raw_data: params,
    }),

  taskExecuted: (params: {
    taskTitle: string;
    actionLabel: string;
    result: string;
    resultMessage: string;
  }) =>
    logAuditEvent({
      event_type: 'task_executed',
      action_taken: `TASK: ${params.taskTitle} → ${params.actionLabel}`,
      rationale: params.resultMessage,
      outcome: 'not_applicable',
      source: 'user',
    }),

  autopilotGenerated: (params: {
    date: string;
    stance: string;
    actionItemCount: number;
    topOpportunities: string[];
    riskFlags: string[];
  }) =>
    logAuditEvent({
      event_type: 'autopilot_generated',
      action_taken: `AUTOPILOT REPORT: ${params.stance} stance — ${params.actionItemCount} action items`,
      rationale: `Opportunities: ${params.topOpportunities.join(', ')}. Risks: ${params.riskFlags.join(', ')}`,
      outcome: 'not_applicable',
      source: 'autopilot',
      raw_data: params,
    }),

  intelligenceActedOn: (params: {
    ticker: string;
    source: string;
    headline: string;
    sentiment: string;
    actionTaken: string;
  }) =>
    logAuditEvent({
      event_type: 'intelligence_signal_acted',
      ticker: params.ticker,
      action_taken: `INTEL ACTED: ${params.actionTaken}`,
      rationale: `Source: ${params.source}. Signal: ${params.headline}. Sentiment: ${params.sentiment}`,
      intelligence_data: params,
      outcome: 'pending',
      source: 'system',
    }),
};
