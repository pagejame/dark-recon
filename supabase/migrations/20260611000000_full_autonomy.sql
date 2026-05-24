-- Full autonomy mode settings
insert into settings (key, value, updated_at) values
  ('full_autonomy_enabled', '{"enabled": true, "started_at": null, "ends_at": null}'::jsonb, now()),
  ('autonomy_min_conviction', '{"score": 8}'::jsonb, now()),
  ('autonomy_max_position_pct', '{"pct": 5}'::jsonb, now()),
  ('autonomy_daily_trade_limit', '{"limit": 3}'::jsonb, now())
on conflict (key) do nothing;
