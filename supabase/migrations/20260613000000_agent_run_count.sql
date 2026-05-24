insert into settings (key, value, updated_at)
values ('agent_run_count', '{"count": 0}'::jsonb, now())
on conflict (key) do nothing;
