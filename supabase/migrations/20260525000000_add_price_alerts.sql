create table if not exists price_alerts (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  condition text not null check (condition in ('above', 'below')),
  target_price numeric(10,4) not null,
  current_price numeric(10,4),
  status text not null default 'active' check (status in ('active', 'triggered', 'dismissed')),
  note text,
  triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists alerts_status_idx on price_alerts(status);
create index if not exists alerts_ticker_idx on price_alerts(ticker);
