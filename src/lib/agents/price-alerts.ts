import type { SupabaseClient } from '@supabase/supabase-js';

export interface PriceAlertRow {
  id: string;
  ticker: string;
  condition: 'above' | 'below';
  target_price: number;
  current_price?: number | null;
  status: string;
  note?: string | null;
  triggered_at?: string | null;
  last_fired_at?: string | null;
  fire_count?: number | null;
  created_at: string;
}

export interface AlertCheckResult {
  triggered: PriceAlertRow[];
  checked: number;
  prices: Record<string, number | null>;
}

const priceCache: Record<string, { price: number; timestamp: number }> = {};
const PRICE_CACHE_TTL = 60 * 1000;

export async function getLivePrice(ticker: string): Promise<number | null> {
  const cached = priceCache[ticker];
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
    return cached.price;
  }

  try {
    const res = await fetch(
      `https://data.alpaca.markets/v2/stocks/${ticker}/quotes/latest`,
      {
        headers: {
          'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
          'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET || '',
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const price = data?.quote?.ap || data?.quote?.bp || null;
    if (price) {
      priceCache[ticker] = { price, timestamp: Date.now() };
    }
    return price;
  } catch {
    return null;
  }
}

function isTriggered(alert: PriceAlertRow, currentPrice: number): boolean {
  return (
    (alert.condition === 'above' && currentPrice >= alert.target_price) ||
    (alert.condition === 'below' && currentPrice <= alert.target_price)
  );
}

export async function checkPriceAlerts(
  supabase: SupabaseClient
): Promise<AlertCheckResult> {
  const { data: alerts, error } = await supabase
    .from('price_alerts')
    .select('*')
    .eq('status', 'active');

  if (error || !alerts || alerts.length === 0) {
    return { triggered: [], checked: 0, prices: {} };
  }

  const typedAlerts = alerts as PriceAlertRow[];
  const triggered: PriceAlertRow[] = [];
  const uniqueTickers = [...new Set(typedAlerts.map((a) => a.ticker))];

  const prices: Record<string, number | null> = {};
  await Promise.all(
    uniqueTickers.map(async (ticker) => {
      prices[ticker] = await getLivePrice(ticker);
    })
  );

  const now = new Date().toISOString();

  const cooldownMs = 30 * 60 * 1000;

  for (const alert of typedAlerts) {
    const currentPrice = prices[alert.ticker];
    if (!currentPrice) continue;

    await supabase
      .from('price_alerts')
      .update({ current_price: currentPrice, updated_at: now })
      .eq('id', alert.id);

    if (!isTriggered(alert, currentPrice)) continue;

    const fireCount = alert.fire_count || 0;
    if (fireCount >= 5) {
      await supabase
        .from('price_alerts')
        .update({ status: 'dismissed', updated_at: now })
        .eq('id', alert.id);
      console.log(`Alert auto-dismissed after 5 fires: ${alert.ticker}`);
      continue;
    }

    const lastFired = alert.last_fired_at ? new Date(alert.last_fired_at) : null;
    if (lastFired && Date.now() - lastFired.getTime() < cooldownMs) {
      continue;
    }

    await supabase
      .from('price_alerts')
      .update({
        last_fired_at: now,
        fire_count: fireCount + 1,
        status: 'triggered',
        current_price: currentPrice,
        triggered_at: alert.triggered_at || now,
        updated_at: now,
      })
      .eq('id', alert.id);

    triggered.push({ ...alert, current_price: currentPrice });
  }

  return { triggered, checked: typedAlerts.length, prices };
}
