-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Signals table
create table if not exists signals (
  id uuid primary key default uuid_generate_v4(),
  ticker text not null,
  signal_type text not null,
  strength text not null check (strength in ('high', 'medium', 'low')),
  summary text not null,
  raw_data jsonb,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'passed', 'executed')),
  scanned_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Morning briefings table
create table if not exists briefings (
  id uuid primary key default uuid_generate_v4(),
  date text not null,
  market_status text,
  sentiment text,
  briefing_text text not null,
  top_signals jsonb,
  key_levels jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Watchlist table
create table if not exists watchlist (
  id uuid primary key default uuid_generate_v4(),
  ticker text not null unique,
  notes text,
  added_at timestamptz not null default now()
);

-- Positions table
create table if not exists positions (
  id uuid primary key default uuid_generate_v4(),
  ticker text not null,
  position_type text not null check (position_type in ('stock', 'call', 'put')),
  entry_price numeric(10,4) not null,
  current_price numeric(10,4),
  quantity integer not null default 1,
  strike_price numeric(10,4),
  expiration_date date,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  exit_price numeric(10,4),
  pnl numeric(10,4),
  pnl_percent numeric(8,4)
);

-- Trade journal table
create table if not exists trade_journal (
  id uuid primary key default uuid_generate_v4(),
  position_id uuid references positions(id) on delete cascade,
  ticker text not null,
  position_type text,
  thesis text,
  signal_source text,
  entry_notes text,
  exit_notes text,
  result text check (result in ('win', 'loss', 'breakeven')),
  lessons text,
  tags text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists signals_ticker_idx on signals(ticker);
create index if not exists signals_strength_idx on signals(strength);
create index if not exists signals_created_idx on signals(created_at desc);
create index if not exists briefings_date_idx on briefings(date);
create index if not exists positions_status_idx on positions(status);
create index if not exists positions_ticker_idx on positions(ticker);

-- Insert default watchlist tickers
insert into watchlist (ticker) values
  ('SPY'), ('QQQ'), ('NVDA'), ('AMD'), ('TSLA'),
  ('META'), ('AAPL'), ('MSFT'), ('AMZN'), ('GOOGL')
on conflict (ticker) do nothing;
