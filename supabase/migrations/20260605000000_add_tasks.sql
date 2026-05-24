create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text,
  category text not null default 'general' check (category in ('platform', 'trading', 'research', 'general', 'urgent')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  priority integer not null default 2 check (priority between 1 and 3),
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_status_idx on tasks(status);
create index if not exists tasks_priority_idx on tasks(priority);

insert into tasks (title, notes, category, priority, status) values
  ('Cancel pending Alpaca limit orders', 'Cancel XLE, META, LLY limit orders before Tuesday open. Go to Alpaca paper trading dashboard.', 'urgent', 1, 'pending'),
  ('Close all open positions', 'Close GM, NVDA, QQQ positions. Start fresh at $100,000 for Dark Recon Alpha launch.', 'urgent', 1, 'pending'),
  ('Clear trade queue in Supabase', 'Delete pending rows from trade_queue table before Tuesday. Fresh start for paper trading.', 'platform', 1, 'pending'),
  ('Run launch checklist', 'Go to /launch — verify all 10 checks are green before market opens Tuesday.', 'platform', 1, 'pending'),
  ('Fix layout spacing between sidebar and content', 'Empty space between sidebar and content causes unnecessary scrolling. Cursor fix pending.', 'platform', 2, 'pending'),
  ('Fix congressional data — Smart Money page', 'Smart Money still showing demo data for Pelosi/Tuberville trades. Need working live data source.', 'platform', 2, 'pending'),
  ('Fix Reddit sweep in Intelligence Feed', 'Reddit sources returning empty. User-Agent fix attempted but inconsistent.', 'platform', 2, 'pending'),
  ('Add tickers to Recon Feed watchlist', 'Populate watchlist with your target tickers so auto-population and signals work correctly.', 'trading', 2, 'pending'),
  ('Review and approve first Trade Queue Tuesday morning', 'Check /queue at 9AM ET — approve or pass pre-built trades before market opens.', 'trading', 1, 'pending'),
  ('Log first strategy decisions in Decision Log', 'Go to /strategy — log your first entry decisions with rationale and conviction score.', 'trading', 2, 'pending'),
  ('Enable Watchlist Auto-Population in Settings', 'Go to Settings → Risk Management → turn on Watchlist Auto-Population.', 'platform', 3, 'pending'),
  ('Set up price alerts for all Tuesday positions', 'After positions are live, set breakout alerts on each ticker from /alerts.', 'trading', 2, 'pending'),
  ('Verify weekly email arrives Sunday', 'Check pagejame@gmail.com Sunday morning for Dark Recon weekly performance email.', 'platform', 3, 'pending');
