INSERT INTO settings (key, value, updated_at)
VALUES (
  'circuit_breaker_status',
  '{"triggered": false, "should_stop_trading": false, "daily_pnl_pct": 0, "trade_count_today": 0, "market_condition": "normal", "vix_level": 18, "conviction_modifier": 1.0}'::jsonb,
  now()
)
ON CONFLICT (key) DO NOTHING;
