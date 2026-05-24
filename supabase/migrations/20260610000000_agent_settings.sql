-- Insert default agent settings
insert into settings (key, value, updated_at)
values ('autonomous_agent_enabled', '{"enabled": true}'::jsonb, now())
on conflict (key) do nothing;
