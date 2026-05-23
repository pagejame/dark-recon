create table if not exists intelligence_signals (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  signal_type text not null,
  ticker text,
  headline text not null,
  summary text,
  url text,
  sentiment text check (sentiment in ('bullish', 'bearish', 'neutral')),
  strength text check (strength in ('high', 'medium', 'low')),
  raw_data jsonb,
  swept_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists intel_ticker_idx on intelligence_signals(ticker);
create index if not exists intel_swept_idx on intelligence_signals(swept_at desc);
create index if not exists intel_strength_idx on intelligence_signals(strength);
