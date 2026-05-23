-- Signal outcomes tracking
create table if not exists signal_outcomes (
  id uuid primary key default gen_random_uuid(),
  signal_id text,
  ticker text not null,
  signal_type text,
  signal_strength text,
  signal_date timestamptz not null,
  action_taken text check (action_taken in ('executed', 'confirmed', 'passed', 'ignored')),
  action_date timestamptz,
  entry_price numeric(10,4),
  price_at_signal numeric(10,4),
  price_1d numeric(10,4),
  price_5d numeric(10,4),
  price_10d numeric(10,4),
  outcome_1d numeric(8,4),
  outcome_5d numeric(8,4),
  outcome_10d numeric(8,4),
  result text check (result in ('win', 'loss', 'neutral', 'pending')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists outcomes_ticker_idx on signal_outcomes(ticker);
create index if not exists outcomes_result_idx on signal_outcomes(result);
create index if not exists outcomes_date_idx on signal_outcomes(signal_date desc);

-- Stop loss presets
create table if not exists stop_loss_presets (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  position_type text not null,
  entry_price numeric(10,4) not null,
  stop_price numeric(10,4) not null,
  stop_pct numeric(6,4) not null,
  alert_id text,
  status text not null default 'active' check (status in ('active', 'triggered', 'cancelled')),
  created_at timestamptz not null default now()
);
