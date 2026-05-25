import { getAutonomyConfig } from './autonomy';
import { createAdminClient } from '@/lib/supabase/admin';

const ALPACA_BASE = 'https://paper-api.alpaca.markets';
const ALPACA_KEY = process.env.ALPACA_API_KEY || '';
const ALPACA_SECRET = process.env.ALPACA_API_SECRET || '';

export interface ShortEntry {
  ticker: string;
  shares: number;
  entry_price: number;
  profit_target: number;
  stop_loss: number;
  rationale: string;
}

interface AlpacaPosition {
  symbol: string;
  qty: string;
  current_price?: string;
  avg_entry_price?: string;
}

export async function executeShortEntry(
  entry: ShortEntry
): Promise<{ success: boolean; order_id?: string; error?: string }> {
  try {
    const config = await getAutonomyConfig();
    if (!config.short_selling_enabled) {
      return { success: false, error: 'Short selling disabled' };
    }

    const supabase = createAdminClient();
    const today = new Date().toISOString().split('T')[0];
    const { count } = await supabase
      .from('audit_log')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'trade_executed')
      .gte('event_at', `${today}T00:00:00Z`);

    if ((count || 0) >= config.daily_trade_limit) {
      return { success: false, error: 'Daily trade limit reached' };
    }

    const res = await fetch(`${ALPACA_BASE}/v2/orders`, {
      method: 'POST',
      headers: {
        'APCA-API-KEY-ID': ALPACA_KEY,
        'APCA-API-SECRET-KEY': ALPACA_SECRET,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        symbol: entry.ticker,
        qty: entry.shares.toString(),
        side: 'sell',
        type: 'market',
        time_in_force: 'day',
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: err.message || 'Short order failed' };
    }

    const order = await res.json();

    try {
      await supabase.from('audit_log').insert({
        event_type: 'trade_executed',
        ticker: entry.ticker,
        action_taken: `SHORT ENTRY: Sold ${entry.shares} ${entry.ticker} @ $${entry.entry_price} — target $${entry.profit_target}`,
        rationale: entry.rationale,
        price_at_action: entry.entry_price,
        quantity: entry.shares,
        dollar_amount: entry.entry_price * entry.shares,
        outcome: 'pending',
        source: 'system',
        event_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Short audit log error:', e);
    }

    try {
      await supabase.from('price_alerts').insert({
        ticker: entry.ticker,
        condition: 'above',
        target_price: entry.stop_loss,
        status: 'active',
        note: `Short stop loss — buy to cover if price exceeds $${entry.stop_loss}`,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Short stop alert error:', e);
    }

    return { success: true, order_id: order.id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function getCoverableShorts(): Promise<AlpacaPosition[]> {
  try {
    const res = await fetch(`${ALPACA_BASE}/v2/positions`, {
      headers: {
        'APCA-API-KEY-ID': ALPACA_KEY,
        'APCA-API-SECRET-KEY': ALPACA_SECRET,
      },
    });
    if (!res.ok) return [];
    const positions = await res.json();
    return (Array.isArray(positions) ? positions : []).filter(
      (p: AlpacaPosition) => parseFloat(p.qty) < 0
    );
  } catch {
    return [];
  }
}
