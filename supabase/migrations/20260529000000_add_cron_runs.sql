create table if not exists cron_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  status text not null check (status in ('success', 'partial', 'failed')),
  results jsonb,
  duration_ms integer,
  ran_at timestamptz not null default now()
);

create index if not exists cron_runs_job_idx on cron_runs(job_name);
create index if not exists cron_runs_ran_idx on cron_runs(ran_at desc);
