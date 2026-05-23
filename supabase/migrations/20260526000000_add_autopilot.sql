create table if not exists autopilot_reports (
  id uuid primary key default gen_random_uuid(),
  date text not null,
  market_sentiment text,
  overall_action text check (overall_action in ('aggressive', 'moderate', 'defensive', 'hold')),
  report_text text not null,
  action_items jsonb,
  positions_review jsonb,
  top_opportunities jsonb,
  risk_flags jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists autopilot_date_idx on autopilot_reports(date);
