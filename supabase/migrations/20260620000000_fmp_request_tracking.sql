INSERT INTO settings (key, value, updated_at)
VALUES ('fmp_request_count', '{"count": 0, "date": ""}'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
