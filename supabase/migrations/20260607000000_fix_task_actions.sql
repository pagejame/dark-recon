-- Fix tasks that have wrong or missing action types

-- Intelligence sweep fix
update tasks set 
  action_type = 'api',
  action_endpoint = '/api/intelligence?refresh=true',
  action_method = 'GET',
  action_body = null
where title ilike '%reddit%' or title ilike '%intelligence%' or title ilike '%sweep%';

-- Smart money fix
update tasks set 
  action_type = 'api',
  action_endpoint = '/api/smartmoney',
  action_method = 'GET',
  action_body = null
where title ilike '%congressional%' or title ilike '%smart money%';

-- Trade queue review fix
update tasks set 
  action_type = 'api',
  action_endpoint = '/api/queue',
  action_method = 'POST',
  action_body = '{"action": "build"}'::jsonb
where title ilike '%review%queue%' or title ilike '%approve%trade%';

-- Price alerts fix (keep as nav — user needs to manually set their own targets)
update tasks set 
  action_type = 'nav',
  action_endpoint = '/alerts'
where title ilike '%price alert%' or title ilike '%set alert%';

-- Strategy decisions fix (keep as nav — user needs to type their own rationale)
update tasks set 
  action_type = 'nav',
  action_endpoint = '/strategy'
where title ilike '%strategy%decision%' or title ilike '%log%decision%';

-- Watchlist fix (keep as nav — user needs to manually add their tickers)
update tasks set 
  action_type = 'nav',
  action_endpoint = '/recon'
where title ilike '%add tickers%' or (title ilike '%watchlist%' and action_type is null);

-- Weekly email verification fix
update tasks set 
  action_type = 'api',
  action_endpoint = '/api/email/test',
  action_method = 'POST'
where title ilike '%verify%email%' or title ilike '%weekly email%';

-- Scanner fix
update tasks set
  action_type = 'api', 
  action_endpoint = '/api/scan',
  action_method = 'GET'
where title ilike '%signal%' and title ilike '%scanner%';
