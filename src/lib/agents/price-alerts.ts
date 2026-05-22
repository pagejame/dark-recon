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

  for (const alert of typedAlerts) {
    const currentPrice = prices[alert.ticker];
    if (!currentPrice) continue;

    await supabase
      .from('price_alerts')
      .update({ current_price: currentPrice, updated_at: now })
      .eq('id', alert.id);

    if (isTriggered(alert, currentPrice)) {
      await supabase
        .from('price_alerts')
        .update({
          status: 'triggered',
          current_price: currentPrice,
          triggered_at: now,
          updated_at: now,
        })
        .eq('id', alert.id);

      triggered.push({ ...alert, current_price: currentPrice });
    }
  }

  return { triggered, checked: typedAlerts.length, prices };
}
