-- Add auto_generated and signal_sources to theses if not present
ALTER TABLE theses ADD COLUMN IF NOT EXISTS auto_generated boolean DEFAULT false;
ALTER TABLE theses ADD COLUMN IF NOT EXISTS signal_sources text[];
ALTER TABLE theses ADD COLUMN IF NOT EXISTS catalyst text;
ALTER TABLE theses ADD COLUMN IF NOT EXISTS risk_note text;
ALTER TABLE theses ADD COLUMN IF NOT EXISTS conviction_score integer;
ALTER TABLE theses ADD COLUMN IF NOT EXISTS entry_note text;
ALTER TABLE theses ADD COLUMN IF NOT EXISTS thesis text;

-- Add source and notes to signals if not present
ALTER TABLE signals ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS notes text;

-- Index for pipeline queries
CREATE INDEX IF NOT EXISTS signals_status_created_idx ON signals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS theses_auto_created_idx ON theses(auto_generated, created_at DESC);
