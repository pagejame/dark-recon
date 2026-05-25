-- Day trading configuration
INSERT INTO settings (key, value, updated_at) VALUES
  ('autonomy_daily_trade_limit', '{"limit": 100}'::jsonb, now()),
  ('autonomy_min_conviction', '{"score": 7}'::jsonb, now()),
  ('autonomy_max_position_pct', '{"pct": 3}'::jsonb, now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

UPDATE settings
SET value = COALESCE(value, '{}'::jsonb) || '{"trading_mode": "day_trading", "profit_target_pct": 2, "profit_target_2_pct": 5, "profit_target_3_pct": 10, "stop_loss_pct": 1.5, "trailing_stop_pct": 1, "short_selling_enabled": true, "same_day_reentry": true, "max_concurrent_positions": 10}'::jsonb,
    updated_at = now()
WHERE key = 'full_autonomy_enabled';

CREATE TABLE IF NOT EXISTS position_alerts (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  alert_type text,
  message text,
  severity text check (severity in ('critical', 'warning', 'info')),
  status text default 'active',
  current_price numeric(10,4),
  trigger_price numeric(10,4),
  fired_at timestamptz,
  created_at timestamptz not null default now()
);

ALTER TABLE position_alerts ADD COLUMN IF NOT EXISTS trigger_price numeric(10,4);
ALTER TABLE position_alerts ADD COLUMN IF NOT EXISTS current_price numeric(10,4);

ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS setup_type text;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS intraday boolean DEFAULT false;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS profit_target_hit integer;

CREATE INDEX IF NOT EXISTS cron_runs_agent_loop_idx ON cron_runs(job_name, ran_at DESC) WHERE job_name = 'agent-loop';
