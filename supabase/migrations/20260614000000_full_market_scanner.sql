-- Market symbols table — stores all tracked symbols
create table if not exists market_symbols (
  id uuid primary key default gen_random_uuid(),
  ticker text not null unique,
  company_name text,
  exchange text,
  sector text,
  industry text,
  market_cap numeric(15,2),
  in_sp500 boolean default false,
  in_nasdaq100 boolean default false,
  in_russell2000 boolean default false,
  last_updated timestamptz default now()
);

create index if not exists market_symbols_ticker_idx on market_symbols(ticker);
create index if not exists market_symbols_sp500_idx on market_symbols(in_sp500);
create index if not exists market_symbols_nasdaq_idx on market_symbols(in_nasdaq100);

-- Scanner results table
create table if not exists scanner_results (
  id uuid primary key default gen_random_uuid(),
  scan_date date not null default current_date,
  scan_type text not null,
  ticker text not null,
  company_name text,
  signal_strength numeric(5,2),
  signal_data jsonb,
  claude_thesis text,
  conviction_score integer,
  added_to_watchlist boolean default false,
  created_at timestamptz default now()
);

create index if not exists scanner_results_date_idx on scanner_results(scan_date desc);
create index if not exists scanner_results_ticker_idx on scanner_results(ticker);
create index if not exists scanner_results_type_idx on scanner_results(scan_type);
create index if not exists scanner_results_conviction_idx on scanner_results(conviction_score desc);

alter table market_symbols enable row level security;
alter table scanner_results enable row level security;
create policy "service_role_all_market_symbols" on market_symbols for all to service_role using (true) with check (true);
create policy "service_role_all_scanner_results" on scanner_results for all to service_role using (true) with check (true);
