-- Extend earnings_events cache table for earnings play auto-queue tracking
alter table earnings_events add column if not exists play_queued boolean default false;
alter table earnings_events add column if not exists play_queue_id uuid references trade_queue(id);

-- Pre-market data persisted with morning briefings
alter table briefings add column if not exists premarket_data jsonb;
alter table briefings add column if not exists limit_order_assessments jsonb;
