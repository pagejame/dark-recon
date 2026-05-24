create table if not exists trade_queue (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  direction text not null check (direction in ('long', 'short')),
  instrument_type text not null check (instrument_type in ('stock', 'call', 'put')),
  qty integer,
  entry_type text not null check (entry_type in ('market', 'limit')),
  limit_price numeric(10,4),
  options_symbol text,
  strike_price numeric(10,4),
  expiration_date date,
  contracts integer,
  position_size_pct numeric(5,2),
  dollar_amount numeric(12,2),
  stop_loss_price numeric(10,4),
  stop_loss_pct numeric(5,2),
  conviction_score integer not null,
  signal_sources text[] not null default '{}',
  thesis_summary text not null,
  key_catalyst text,
  risk_note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'executed', 'failed')),
  rejection_reason text,
  alpaca_order_id text,
  queued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  actioned_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists queue_status_idx on trade_queue(status);
create index if not exists queue_queued_idx on trade_queue(queued_at desc);
create index if not exists queue_ticker_idx on trade_queue(ticker);
