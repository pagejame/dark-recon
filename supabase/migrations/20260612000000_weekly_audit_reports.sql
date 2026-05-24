create table if not exists weekly_audit_reports (
  id uuid primary key default gen_random_uuid(),
  week_start timestamptz not null,
  week_end timestamptz not null,
  report_data jsonb not null,
  claude_analysis text,
  recommendations text[],
  performance_summary jsonb,
  generated_at timestamptz not null default now()
);

create index if not exists weekly_reports_week_start_idx on weekly_audit_reports(week_start desc);
