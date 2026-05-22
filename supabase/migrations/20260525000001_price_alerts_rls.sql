-- Ensure price_alerts is accessible without RLS blocking anon inserts
alter table price_alerts disable row level security;

grant all on price_alerts to anon;
grant all on price_alerts to authenticated;
