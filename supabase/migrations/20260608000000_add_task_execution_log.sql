-- Task execution log — records every completed task action
create table if not exists task_execution_log (
  id uuid primary key default gen_random_uuid(),
  task_title text not null,
  task_category text,
  action_taken text not null,
  action_label text not null,
  result text not null check (result in ('success', 'failed', 'skipped', 'manual')),
  result_message text,
  issue_fingerprint text,
  executed_at timestamptz not null default now()
);

create index if not exists exec_log_fingerprint_idx on task_execution_log(issue_fingerprint);
create index if not exists exec_log_executed_idx on task_execution_log(executed_at desc);
create index if not exists exec_log_title_idx on task_execution_log(task_title);

alter table tasks add column if not exists issue_fingerprint text;
alter table tasks add column if not exists last_executed_at timestamptz;
alter table tasks add column if not exists execution_result text;
alter table tasks add column if not exists execution_message text;
