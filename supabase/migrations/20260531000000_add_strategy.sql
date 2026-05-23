-- Strategy configuration
create table if not exists strategy_config (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Dark Recon Alpha',
  description text,
  max_positions integer not null default 10,
  max_position_pct numeric(5,2) not null default 10.00,
  min_conviction_score integer not null default 6,
  rebalance_frequency text not null default 'weekly',
  benchmark_ticker text not null default 'SPY',
  strategy_start_date date not null default current_date,
  starting_capital numeric(12,2) not null default 100000.00,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Strategy performance snapshots (daily)
create table if not exists strategy_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  portfolio_value numeric(12,2) not null,
  cash numeric(12,2),
  invested numeric(12,2),
  day_pnl numeric(12,2),
  total_pnl numeric(12,2),
  total_return_pct numeric(8,4),
  benchmark_value numeric(12,2),
  benchmark_return_pct numeric(8,4),
  alpha numeric(8,4),
  positions_count integer,
  snapshot_data jsonb,
  created_at timestamptz not null default now(),
  unique(snapshot_date)
);

-- Strategy decisions log
create table if not exists strategy_decisions (
  id uuid primary key default gen_random_uuid(),
  decision_date timestamptz not null default now(),
  decision_type text not null check (decision_type in ('entry', 'exit', 'rebalance', 'pass', 'hold')),
  ticker text,
  rationale text not null,
  conviction_score integer,
  signal_source text,
  action_taken boolean not null default false,
  outcome text,
  created_at timestamptz not null default now()
);

create index if not exists snapshots_date_idx on strategy_snapshots(snapshot_date desc);
create index if not exists decisions_date_idx on strategy_decisions(decision_date desc);
create index if not exists decisions_ticker_idx on strategy_decisions(ticker);

-- Insert default strategy config
insert into strategy_config (name, description) values (
  'Dark Recon Alpha',
  'AI-driven systematic strategy using congressional intelligence, options flow signals, and earnings catalysts. Maximum 10 positions, minimum conviction score 6/10.'
) on conflict do nothing;
