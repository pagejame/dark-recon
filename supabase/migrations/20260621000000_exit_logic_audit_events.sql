-- Expand audit_log event types for exit logic and other system events
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_event_type_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_event_type_check CHECK (
  event_type = ANY (ARRAY[
    'trade_executed', 'trade_approved', 'trade_rejected', 'trade_queue_built',
    'signal_fired', 'signal_confirmed', 'signal_passed',
    'autopilot_generated', 'autopilot_action_taken',
    'congressional_trade_reviewed', 'intelligence_signal_acted',
    'stop_loss_triggered', 'stop_loss_created',
    'price_alert_triggered', 'price_alert_created',
    'position_opened', 'position_closed', 'position_peak_pnl',
    'site_scan_run', 'task_executed', 'manual_override',
    'rebalance_triggered', 'earnings_play_queued',
    'system_health_checked', 'circuit_breaker_triggered',
    'trading_mode_changed', 'eod_force_close',
    'profit_target_hit', 'stop_loss_cut', 'trailing_stop_updated'
  ])
);
