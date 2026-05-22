create table if not exists theses (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  company_name text,
  conviction_score integer,
  overall_direction text check (overall_direction in ('bullish', 'bearish', 'neutral')),
  thesis_data jsonb not null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists theses_ticker_idx on theses(ticker);
create index if not exists theses_created_idx on theses(created_at desc);
