create table if not exists smartmoney_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

create index if not exists smartmoney_key_idx on smartmoney_cache(cache_key);
