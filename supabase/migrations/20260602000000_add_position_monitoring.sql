-- Position alerts (different from price alerts — these are position-specific)
create table if not exists position_alerts (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  alert_type text not null check (alert_type in ('stop_loss', 'take_profit', 'trailing_stop', 'time_decay', 'drawdown_warning')),
  message text not null,
  severity text not null check (severity in ('critical', 'warning', 'info')),
  current_price numeric(10,4),
  trigger_price numeric(10,4),
  position_pnl_pct numeric(8,4),
  status text not null default 'active' check (status in ('active', 'dismissed', 'actioned')),
  fired_at timestamptz not null default now(),
  dismissed_at timestamptz
);

create index if not exists pos_alerts_status_idx on position_alerts(status);
create index if not exists pos_alerts_fired_idx on position_alerts(fired_at desc);

-- Signal outcome tracking enhancements
alter table signal_outcomes
  add column if not exists auto_tracked boolean default false,
  add column if not exists last_checked_at timestamptz,
  add column if not exists price_at_1d numeric(10,4),
  add column if not exists price_at_5d numeric(10,4),
  add column if not exists price_at_10d numeric(10,4);
