-- Comprehensive immutable audit log
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'trade_executed',
    'trade_approved',
    'trade_rejected',
    'trade_queue_built',
    'signal_fired',
    'signal_confirmed',
    'signal_passed',
    'autopilot_generated',
    'autopilot_action_taken',
    'congressional_trade_reviewed',
    'intelligence_signal_acted',
    'stop_loss_triggered',
    'stop_loss_created',
    'price_alert_triggered',
    'price_alert_created',
    'position_opened',
    'position_closed',
    'site_scan_run',
    'task_executed',
    'manual_override',
    'rebalance_triggered',
    'earnings_play_queued',
    'system_health_checked'
  )),
  ticker text,
  action_taken text not null,
  rationale text,
  price_at_action numeric(10,4),
  quantity numeric(10,4),
  dollar_amount numeric(12,2),
  portfolio_value_at_action numeric(12,2),
  signal_sources text[],
  conviction_score integer,
  congressional_data jsonb,
  intelligence_data jsonb,
  autopilot_recommendation text,
  outcome text check (outcome in ('win', 'loss', 'neutral', 'pending', 'not_applicable')),
  outcome_notes text,
  price_at_outcome numeric(10,4),
  pnl_dollar numeric(12,2),
  pnl_pct numeric(8,4),
  source text not null default 'system' check (source in ('system', 'user', 'autopilot', 'cron')),
  session_context text,
  raw_data jsonb,
  event_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists audit_event_type_idx on audit_log(event_type);
create index if not exists audit_ticker_idx on audit_log(ticker);
create index if not exists audit_event_at_idx on audit_log(event_at desc);
create index if not exists audit_source_idx on audit_log(source);
create index if not exists audit_outcome_idx on audit_log(outcome);
