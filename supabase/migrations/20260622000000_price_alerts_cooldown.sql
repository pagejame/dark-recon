ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS last_fired_at timestamptz;
ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS fire_count integer DEFAULT 0;

ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_status_check;
ALTER TABLE signals ADD CONSTRAINT signals_status_check
  CHECK (status IN ('pending', 'confirmed', 'passed', 'executed', 'expired'));
