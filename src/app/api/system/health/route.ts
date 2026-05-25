import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 30;

interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  latency_ms?: number;
}

async function checkAlpaca(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const res = await fetch('https://paper-api.alpaca.markets/v2/account', {
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
        'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET || '',
      },
    });
    const latency = Date.now() - start;
    if (!res.ok) {
      return {
        name: 'Alpaca Markets',
        status: 'fail',
        message: `API returned ${res.status}`,
        latency_ms: latency,
      };
    }
    const data = await res.json();
    const equity = parseFloat(data.equity || '0');
    return {
      name: 'Alpaca Markets',
      status: 'pass',
      message: `Connected — Paper account $${equity.toLocaleString()}`,
      latency_ms: latency,
    };
  } catch (e) {
    return {
      name: 'Alpaca Markets',
      status: 'fail',
      message: e instanceof Error ? e.message : 'Connection failed',
    };
  }
}

async function checkSupabase(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const supabase = createAdminClient();
    const { count, error } = await supabase
      .from('trade_queue')
      .select('*', { count: 'exact', head: true });
    const latency = Date.now() - start;
    if (error) {
      return {
        name: 'Supabase Database',
        status: 'fail',
        message: error.message,
        latency_ms: latency,
      };
    }
    return {
      name: 'Supabase Database',
      status: 'pass',
      message: `Connected — ${count || 0} queue entries`,
      latency_ms: latency,
    };
  } catch (e) {
    return {
      name: 'Supabase Database',
      status: 'fail',
      message: e instanceof Error ? e.message : 'Connection failed',
    };
  }
}

async function checkFinnhub(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const key = process.env.FINNHUB_API_KEY;
    if (!key) {
      return { name: 'Finnhub API', status: 'fail', message: 'FINNHUB_API_KEY not set in environment' };
    }
    const res = await fetch('https://finnhub.io/api/v1/quote?symbol=SPY', {
      headers: { 'X-Finnhub-Token': key },
    });
    const latency = Date.now() - start;
    if (!res.ok) {
      return {
        name: 'Finnhub API',
        status: 'fail',
        message: `API returned ${res.status}`,
        latency_ms: latency,
      };
    }
    const data = await res.json();
    if (!data.c) {
      return {
        name: 'Finnhub API',
        status: 'warn',
        message: 'Connected but no quote data returned',
        latency_ms: latency,
      };
    }
    return {
      name: 'Finnhub API',
      status: 'pass',
      message: `Connected — SPY $${data.c}`,
      latency_ms: latency,
    };
  } catch (e) {
    return {
      name: 'Finnhub API',
      status: 'fail',
      message: e instanceof Error ? e.message : 'Connection failed',
    };
  }
}

async function checkAnthropic(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return {
        name: 'Anthropic Claude',
        status: 'fail',
        message: 'ANTHROPIC_API_KEY not set in environment',
      };
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    const latency = Date.now() - start;
    if (!res.ok) {
      return {
        name: 'Anthropic Claude',
        status: 'fail',
        message: `API returned ${res.status}`,
        latency_ms: latency,
      };
    }
    return {
      name: 'Anthropic Claude',
      status: 'pass',
      message: 'Connected — claude-sonnet-4-6 responding',
      latency_ms: latency,
    };
  } catch (e) {
    return {
      name: 'Anthropic Claude',
      status: 'fail',
      message: e instanceof Error ? e.message : 'Connection failed',
    };
  }
}

interface ResendDomain {
  name: string;
  status: string;
}

async function checkResend(): Promise<HealthCheck> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return { name: 'Resend Email', status: 'fail', message: 'RESEND_API_KEY not set in environment' };
  }
  try {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      return { name: 'Resend Email', status: 'fail', message: `API returned ${res.status}` };
    }
    const data = await res.json();
    const darkReconDomain = ((data.data || []) as ResendDomain[]).find(
      (d) => d.name === 'dark-recon.com'
    );
    return {
      name: 'Resend Email',
      status: darkReconDomain ? 'pass' : 'warn',
      message: darkReconDomain
        ? `Connected — dark-recon.com verified (${darkReconDomain.status})`
        : 'Connected but dark-recon.com domain not found',
    };
  } catch (e) {
    return {
      name: 'Resend Email',
      status: 'fail',
      message: e instanceof Error ? e.message : 'Connection failed',
    };
  }
}

async function checkFRED(): Promise<HealthCheck> {
  const key = process.env.FRED_API_KEY;
  if (!key) {
    return {
      name: 'FRED Macro API',
      status: 'warn',
      message: 'FRED_API_KEY not set in environment',
    };
  }
  try {
    const start = Date.now();
    const res = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&api_key=${key}&file_type=json&sort_order=desc&limit=1`,
      { signal: AbortSignal.timeout(6000) }
    );
    const latency = Date.now() - start;
    if (!res.ok) {
      return {
        name: 'FRED Macro API',
        status: 'warn',
        message: `FRED returned ${res.status}`,
        latency_ms: latency,
      };
    }
    const data = await res.json();
    const rate = data?.observations?.[0]?.value;
    return {
      name: 'FRED Macro API',
      status: 'pass',
      message: `Connected — Fed Funds Rate: ${rate}%`,
      latency_ms: latency,
    };
  } catch {
    return {
      name: 'FRED Macro API',
      status: 'warn',
      message: 'Connection timeout — non-critical',
    };
  }
}

async function checkFMP(): Promise<HealthCheck> {
  const key = process.env.FMP_API_KEY;
  if (!key) {
    return {
      name: 'FMP Research API',
      status: 'warn',
      message: 'FMP_API_KEY not set — insider trades, analyst upgrades, press releases unavailable',
    };
  }
  try {
    const res = await fetch(
      `https://financialmodelingprep.com/api/v3/upgrades-downgrades?limit=1&apikey=${key}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) {
      return { name: 'FMP Research API', status: 'warn', message: `FMP returned ${res.status}` };
    }
    const data = await res.json();
    return {
      name: 'FMP Research API',
      status: 'pass',
      message: `Connected — latest analyst change: ${Array.isArray(data) && data[0] ? `${data[0].gradingCompany} on ${data[0].symbol}` : 'data available'}`,
    };
  } catch {
    return { name: 'FMP Research API', status: 'warn', message: 'Connection timeout' };
  }
}

async function checkEnvVars(): Promise<HealthCheck> {
  const required = [
    'ALPACA_API_KEY',
    'ALPACA_API_SECRET',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'FINNHUB_API_KEY',
    'ANTHROPIC_API_KEY',
    'RESEND_API_KEY',
    'CRON_SECRET',
    'DARK_RECON_EMAIL',
    'QUIVER_API_KEY',
    'ALPHA_VANTAGE_KEY',
    'FRED_API_KEY',
    'FMP_API_KEY',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    return {
      name: 'Environment Variables',
      status: 'fail',
      message: `Missing: ${missing.join(', ')}`,
    };
  }

  return {
    name: 'Environment Variables',
    status: 'pass',
    message: `All ${required.length} required variables set`,
  };
}

interface CronRunRow {
  ran_at: string;
  status: string;
  job_name: string;
}

async function checkCronRuns(): Promise<HealthCheck> {
  try {
    const supabase = createAdminClient();
    const criticalJobs = ['morning-run', 'autonomous-agent', 'market-scan', 'agent-loop'];

    const { data } = await supabase
      .from('cron_runs')
      .select('*')
      .order('ran_at', { ascending: false })
      .limit(50);

    if (!data || data.length === 0) {
      return {
        name: 'Cron Jobs',
        status: 'warn',
        message: 'No cron runs recorded yet — first run at 6AM ET Tuesday',
      };
    }

    const runs = data as CronRunRow[];
    const jobMap: Record<string, CronRunRow> = {};
    for (const run of runs) {
      if (!jobMap[run.job_name]) {
        jobMap[run.job_name] = run;
      }
    }

    const staleJobs = Object.values(jobMap).filter((r) => {
      const hoursAgo = (Date.now() - new Date(r.ran_at).getTime()) / (1000 * 60 * 60);
      return criticalJobs.includes(r.job_name) && hoursAgo > 25;
    });

    const lastRun = runs[0];
    const hoursAgo = Math.floor(
      (Date.now() - new Date(lastRun.ran_at).getTime()) / (1000 * 60 * 60)
    );
    const failedRuns = runs.filter((r) => r.status === 'failed');

    if (staleJobs.length > 0) {
      return {
        name: 'Cron Jobs',
        status: 'warn',
        message: `Stale jobs (>25h): ${staleJobs.map((r) => r.job_name).join(', ')}`,
      };
    }

    return {
      name: 'Cron Jobs',
      status: failedRuns.length > 0 ? 'warn' : 'pass',
      message:
        failedRuns.length > 0
          ? `Last run ${hoursAgo}h ago — ${failedRuns.length} failed runs detected`
          : `Last run: ${lastRun.job_name} ${hoursAgo}h ago (${lastRun.status})`,
    };
  } catch {
    return { name: 'Cron Jobs', status: 'warn', message: 'Could not check cron history' };
  }
}

async function checkAlpacaOptions(): Promise<HealthCheck> {
  try {
    const res = await fetch(
      'https://data.alpaca.markets/v1beta1/options/snapshots/AAPL?feed=indicative&limit=1',
      {
        headers: {
          'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
          'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET || '',
        },
      }
    );
    if (!res.ok) {
      return {
        name: 'Alpaca Options',
        status: 'warn',
        message: `Options data returned ${res.status} — check options permissions`,
      };
    }
    const data = await res.json();
    const count = Object.keys(data?.snapshots || {}).length;
    return {
      name: 'Alpaca Options',
      status: 'pass',
      message: `Options chain accessible — ${count} AAPL contract(s) returned`,
    };
  } catch {
    return {
      name: 'Alpaca Options',
      status: 'warn',
      message: 'Options check failed — verify Level 3 options enabled',
    };
  }
}

async function checkAlpacaPositions(): Promise<HealthCheck> {
  try {
    const res = await fetch('https://paper-api.alpaca.markets/v2/positions', {
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
        'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET || '',
      },
    });
    if (!res.ok) {
      return { name: 'Alpaca Positions', status: 'fail', message: `API returned ${res.status}` };
    }
    const positions = await res.json();
    const count = Array.isArray(positions) ? positions.length : 0;
    return {
      name: 'Alpaca Positions',
      status: count > 0 ? 'warn' : 'pass',
      message:
        count > 0
          ? `${count} open position(s) — clear before going live Tuesday`
          : 'No open positions — clean slate ready',
    };
  } catch {
    return { name: 'Alpaca Positions', status: 'fail', message: 'Could not check positions' };
  }
}

async function checkAlpacaOrders(): Promise<HealthCheck> {
  try {
    const res = await fetch('https://paper-api.alpaca.markets/v2/orders?status=open', {
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
        'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET || '',
      },
    });
    if (!res.ok) {
      return { name: 'Alpaca Orders', status: 'fail', message: `API returned ${res.status}` };
    }
    const orders = await res.json();
    const count = Array.isArray(orders) ? orders.length : 0;
    return {
      name: 'Alpaca Orders',
      status: count > 0 ? 'warn' : 'pass',
      message:
        count > 0
          ? `${count} pending order(s) — cancel before going live Tuesday`
          : 'No pending orders — clean slate ready',
    };
  } catch {
    return { name: 'Alpaca Orders', status: 'fail', message: 'Could not check orders' };
  }
}

interface CircuitBreakerSetting {
  should_stop_trading?: boolean;
  reason?: string;
  daily_pnl_pct?: number;
  vix_level?: number;
  trade_count_today?: number;
}

async function checkCircuitBreakerHealth(): Promise<HealthCheck> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'circuit_breaker_status')
      .maybeSingle();

    if (!data?.value) {
      return {
        name: 'Circuit Breaker',
        status: 'pass',
        message: 'Not yet evaluated — will run at market open',
      };
    }

    const cb = data.value as CircuitBreakerSetting;
    if (cb.should_stop_trading) {
      return {
        name: 'Circuit Breaker',
        status: 'warn',
        message: `TRIGGERED: ${cb.reason}`,
      };
    }

    return {
      name: 'Circuit Breaker',
      status: 'pass',
      message: `OK — Daily P&L: ${cb.daily_pnl_pct?.toFixed(2) || '0.00'}% | VIX: ${cb.vix_level?.toFixed(1) || 'N/A'} | Trades: ${cb.trade_count_today || 0}/100`,
    };
  } catch {
    return { name: 'Circuit Breaker', status: 'pass', message: 'Status pending' };
  }
}

export async function GET() {
  const checks = await Promise.all([
    checkEnvVars(),
    checkAlpaca(),
    checkAlpacaPositions(),
    checkAlpacaOrders(),
    checkAlpacaOptions(),
    checkSupabase(),
    checkFinnhub(),
    checkFRED(),
    checkFMP(),
    checkAnthropic(),
    checkResend(),
    checkCronRuns(),
    checkCircuitBreakerHealth(),
  ]);

  const passing = checks.filter((c) => c.status === 'pass').length;
  const failing = checks.filter((c) => c.status === 'fail').length;
  const warnings = checks.filter((c) => c.status === 'warn').length;

  const overall = failing > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass';

  return NextResponse.json({
    overall,
    passing,
    failing,
    warnings,
    total: checks.length,
    checks,
    checked_at: new Date().toISOString(),
    ready_for_launch: failing === 0,
    launch_message:
      failing === 0 && warnings === 0
        ? '🟢 ALL SYSTEMS GO — Dark Recon Alpha is ready to launch'
        : failing === 0
          ? '🟡 READY WITH WARNINGS — Review warnings before launching'
          : '🔴 NOT READY — Fix failing checks before launching',
  });
}
