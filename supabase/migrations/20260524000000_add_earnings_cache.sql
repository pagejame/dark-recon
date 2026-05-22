create table if not exists earnings_events (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  date date not null,
  hour text,
  eps_estimate numeric(10,4),
  eps_actual numeric(10,4),
  revenue_estimate numeric(20,2),
  revenue_actual numeric(20,2),
  quarter integer,
  year integer,
  fetched_at timestamptz not null default now(),
  unique(symbol, date)
);

create index if not exists earnings_symbol_idx on earnings_events(symbol);
create index if not exists earnings_date_idx on earnings_events(date);
