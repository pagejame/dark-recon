import { createAdminClient } from '@/lib/supabase/admin';

const ALPACA_BASE = 'https://paper-api.alpaca.markets';
const ALPACA_KEY = process.env.ALPACA_API_KEY || '';
const ALPACA_SECRET = process.env.ALPACA_API_SECRET || '';

export interface CircuitBreakerStatus {
  triggered: boolean;
  reason: string;
  daily_pnl_pct: number;
  daily_pnl_dollar: number;
  trade_count_today: number;
  market_condition: 'normal' | 'elevated' | 'extreme';
  vix_level: number;
  should_stop_trading: boolean;
  conviction_modifier: number;
}

async function getDailyPnL(): Promise<{ pnl_dollar: number; pnl_pct: number; equity: number }> {
  try {
    const res = await fetch(`${ALPACA_BASE}/v2/account`, {
      headers: {
        'APCA-API-KEY-ID': ALPACA_KEY,
        'APCA-API-SECRET-KEY': ALPACA_SECRET,
      },
    });
    if (!res.ok) return { pnl_dollar: 0, pnl_pct: 0, equity: 100000 };
    const account = await res.json();
    const equity = parseFloat(account.equity || '100000');
    const lastEquity = parseFloat(account.last_equity || equity.toString());
    const pnl = equity - lastEquity;
    const pnlPct = lastEquity > 0 ? (pnl / lastEquity) * 100 : 0;
    return { pnl_dollar: pnl, pnl_pct: pnlPct, equity };
  } catch {
    return { pnl_dollar: 0, pnl_pct: 0, equity: 100000 };
  }
}

async function getVIXLevel(): Promise<number> {
  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=VIX`, {
      headers: { 'X-Finnhub-Token': process.env.FINNHUB_API_KEY || '' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return 18;
    const data = await res.json();
    return data.c || 18;
  } catch {
    return 18;
  }
}

export async function checkCircuitBreaker(): Promise<CircuitBreakerStatus> {
  const supabase = createAdminClient();

  const [pnlData, vix] = await Promise.all([getDailyPnL(), getVIXLevel()]);

  const today = new Date().toISOString().split('T')[0];
  const { count: tradeCount } = await supabase
    .from('audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'trade_executed')
    .gte('event_at', `${today}T00:00:00Z`);

  const dailyPnLPct = pnlData.pnl_pct;
  const dailyLossLimit = -3;
  const hardLossLimit = -5;

  let marketCondition: 'normal' | 'elevated' | 'extreme' = 'normal';
  let convictionModifier = 1.0;
  if (vix > 35) {
    marketCondition = 'extreme';
    convictionModifier = 0;
  } else if (vix > 25) {
    marketCondition = 'elevated';
    convictionModifier = 0.7;
  } else if (vix > 20) {
    marketCondition = 'elevated';
    convictionModifier = 0.85;
  }

  let triggered = false;
  let reason = '';
  let shouldStopTrading = false;

  if (dailyPnLPct <= hardLossLimit) {
    triggered = true;
    shouldStopTrading = true;
    reason = `EMERGENCY STOP: Down ${Math.abs(dailyPnLPct).toFixed(2)}% today — hard loss limit hit`;
  } else if (dailyPnLPct <= dailyLossLimit) {
    triggered = true;
    shouldStopTrading = true;
    reason = `CIRCUIT BREAKER: Down ${Math.abs(dailyPnLPct).toFixed(2)}% today — daily loss limit reached, no new entries`;
  } else if (marketCondition === 'extreme') {
    triggered = true;
    shouldStopTrading = true;
    reason = `VOLATILITY HALT: VIX at ${vix.toFixed(1)} — extreme market conditions, pausing new entries`;
  } else if ((tradeCount || 0) >= 100) {
    triggered = true;
    shouldStopTrading = true;
    reason = `TRADE LIMIT: ${tradeCount} trades executed today — daily limit reached`;
  }

  const status: CircuitBreakerStatus = {
    triggered,
    reason,
    daily_pnl_pct: dailyPnLPct,
    daily_pnl_dollar: pnlData.pnl_dollar,
    trade_count_today: tradeCount || 0,
    market_condition: marketCondition,
    vix_level: vix,
    should_stop_trading: shouldStopTrading,
    conviction_modifier: shouldStopTrading ? 0 : convictionModifier,
  };

  try {
    await supabase.from('settings').upsert(
      {
        key: 'circuit_breaker_status',
        value: status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );
  } catch (e) {
    console.error('Circuit breaker settings save error:', e);
  }

  if (triggered) {
    try {
      await supabase.from('audit_log').insert({
        event_type: 'circuit_breaker_triggered',
        ticker: 'SYSTEM',
        action_taken: `CIRCUIT BREAKER: ${reason}`,
        rationale: `Daily P&L: ${dailyPnLPct.toFixed(2)}% | VIX: ${vix.toFixed(1)} | Trades: ${tradeCount}`,
        outcome: 'not_applicable',
        source: 'system',
        event_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Circuit breaker audit log error:', e);
    }

    try {
      await supabase.from('position_alerts').insert({
        ticker: 'SYSTEM',
        alert_type: 'circuit_breaker',
        message: `🛑 ${reason}`,
        severity: dailyPnLPct <= hardLossLimit ? 'critical' : 'warning',
        status: 'active',
        fired_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Circuit breaker alert error:', e);
    }
  }

  return status;
}

export async function isTradingBlocked(): Promise<boolean> {
  const status = await checkCircuitBreaker().catch(() => null);
  return status?.should_stop_trading ?? false;
}
