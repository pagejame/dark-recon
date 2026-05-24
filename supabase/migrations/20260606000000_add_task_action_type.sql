alter table tasks add column if not exists action_type text;
alter table tasks add column if not exists action_endpoint text;
alter table tasks add column if not exists action_method text default 'GET';
alter table tasks add column if not exists action_body jsonb;

update tasks set
  action_type = 'api',
  action_endpoint = '/api/trading/orders/cancel-all',
  action_method = 'DELETE'
where title ilike '%cancel%order%' or title ilike '%limit order%';

update tasks set
  action_type = 'api',
  action_endpoint = '/api/trading/positions/close-all',
  action_method = 'DELETE'
where title ilike '%close all%position%' or title ilike '%close%open position%';

update tasks set
  action_type = 'api',
  action_endpoint = '/api/queue/clear',
  action_method = 'DELETE'
where title ilike '%clear trade queue%' or title ilike '%clear%queue%';

update tasks set
  action_type = 'api',
  action_endpoint = '/api/system/health',
  action_method = 'GET'
where title ilike '%launch checklist%' or title ilike '%run launch%' or title ilike '%health check%';

update tasks set
  action_type = 'api',
  action_endpoint = '/api/email/test',
  action_method = 'POST'
where title ilike '%weekly email%' or title ilike '%test email%' or title ilike '%verify%email%';

update tasks set
  action_type = 'api',
  action_endpoint = '/api/autopilot?refresh=true',
  action_method = 'GET'
where title ilike '%run autopilot%' or title ilike '%autopilot%';

update tasks set
  action_type = 'api',
  action_endpoint = '/api/queue',
  action_method = 'POST',
  action_body = '{"action": "build"}'::jsonb
where title ilike '%build queue%' or title ilike '%trade queue%approval%';

update tasks set
  action_type = 'api',
  action_endpoint = '/api/settings',
  action_method = 'PATCH',
  action_body = '{"key": "watchlist_autopop_enabled", "value": {"enabled": true}}'::jsonb
where title ilike '%watchlist auto%' or title ilike '%enable%auto%pop%';

update tasks set action_type = 'nav', action_endpoint = '/queue'
where title ilike '%review%queue%' or title ilike '%approve%queue%';

update tasks set action_type = 'nav', action_endpoint = '/recon'
where title ilike '%watchlist%' and action_type is null;

update tasks set action_type = 'nav', action_endpoint = '/strategy'
where title ilike '%strategy%' or title ilike '%decision log%';

update tasks set action_type = 'nav', action_endpoint = '/alerts'
where title ilike '%price alert%' or title ilike '%set alert%';

update tasks set action_type = 'nav', action_endpoint = '/intelligence'
where title ilike '%reddit%' or title ilike '%intelligence%';

update tasks set action_type = 'nav', action_endpoint = '/smartmoney'
where title ilike '%congressional%' or title ilike '%smart money%';

update tasks set action_type = 'nav', action_endpoint = '/settings'
where title ilike '%settings%' and action_type is null;
