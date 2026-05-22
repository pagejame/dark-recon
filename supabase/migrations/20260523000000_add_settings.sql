create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Insert defaults
insert into settings (key, value) values
  ('watchlist', '["SPY","QQQ","NVDA","AMD","TSLA","META","AAPL","MSFT","AMZN","GOOGL"]'),
  ('risk', '{"max_position_pct": 5, "max_options_pct": 15, "weekly_contribution": 500}'),
  ('scanner', '{"auto_scan": true, "scan_interval_minutes": 5, "min_strength": "low"}'),
  ('briefing', '{"enabled": true, "include_levels": true, "include_signals": true}'),
  ('notifications', '{"high_conviction": true, "scan_complete": false, "briefing_ready": true}')
on conflict (key) do nothing;

create index if not exists settings_key_idx on settings(key);
