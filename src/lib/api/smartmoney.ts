const HOUSE_STOCK_WATCHER =
  'https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json';
const SENATE_STOCK_WATCHER =
  'https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json';

export interface CongressionalTrade {
  representative: string;
  ticker: string;
  transaction_date: string;
  disclosure_date: string;
  type: 'Purchase' | 'Sale' | 'Sale (Partial)' | 'Exchange';
  amount: string;
  asset_description: string;
  chamber: 'house' | 'senate';
}

interface RawHouseTrade {
  representative?: string;
  ticker?: string;
  transaction_date?: string;
  disclosure_date?: string;
  type?: string;
  amount?: string;
  asset_description?: string;
}

interface RawSenateTrade {
  senator?: string;
  first_name?: string;
  last_name?: string;
  ticker?: string;
  transaction_date?: string;
  disclosure_date?: string;
  type?: string;
  amount?: string;
  asset_description?: string;
}

let houseCache: { data: RawHouseTrade[]; timestamp: number } | null = null;
let senateCache: { data: RawSenateTrade[]; timestamp: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000;

function parseTradeType(type?: string): CongressionalTrade['type'] {
  if (type === 'Purchase') return 'Purchase';
  if (type === 'Sale (Partial)') return 'Sale (Partial)';
  if (type === 'Exchange') return 'Exchange';
  if (type?.includes('Sale')) return 'Sale';
  return 'Purchase';
}

export async function getRecentCongressionalTrades(
  daysBack = 90,
  limit = 50
): Promise<CongressionalTrade[]> {
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const trades: CongressionalTrade[] = [];

  try {
    if (!houseCache || Date.now() - houseCache.timestamp > CACHE_TTL) {
      const res = await fetch(HOUSE_STOCK_WATCHER, {
        headers: { 'User-Agent': 'DarkRecon/1.0' },
      });
      if (res.ok) {
        const data = await res.json();
        houseCache = { data: Array.isArray(data) ? data : [], timestamp: Date.now() };
      }
    }

    if (houseCache) {
      const houseTrades = houseCache.data
        .filter((t) => {
          const date = new Date(t.transaction_date || t.disclosure_date || '');
          return date >= cutoff && t.ticker && t.ticker !== '--';
        })
        .slice(0, limit)
        .map(
          (t): CongressionalTrade => ({
            representative: t.representative || 'Unknown',
            ticker: t.ticker?.toUpperCase() || '',
            transaction_date: t.transaction_date || '',
            disclosure_date: t.disclosure_date || '',
            type: parseTradeType(t.type),
            amount: t.amount || '$1,001 - $15,000',
            asset_description: t.asset_description || '',
            chamber: 'house',
          })
        );
      trades.push(...houseTrades);
    }
  } catch (e) {
    console.error('House trades fetch error:', e);
  }

  try {
    if (!senateCache || Date.now() - senateCache.timestamp > CACHE_TTL) {
      const res = await fetch(SENATE_STOCK_WATCHER, {
        headers: { 'User-Agent': 'DarkRecon/1.0' },
      });
      if (res.ok) {
        const data = await res.json();
        senateCache = { data: Array.isArray(data) ? data : [], timestamp: Date.now() };
      }
    }

    if (senateCache) {
      const senateTrades = senateCache.data
        .filter((t) => {
          const date = new Date(t.transaction_date || t.disclosure_date || '');
          return date >= cutoff && t.ticker && t.ticker !== '--';
        })
        .slice(0, limit)
        .map(
          (t): CongressionalTrade => ({
            representative:
              t.senator || [t.first_name, t.last_name].filter(Boolean).join(' ') || 'Unknown Senator',
            ticker: t.ticker?.toUpperCase() || '',
            transaction_date: t.transaction_date || '',
            disclosure_date: t.disclosure_date || '',
            type: parseTradeType(t.type),
            amount: t.amount || '$1,001 - $15,000',
            asset_description: t.asset_description || '',
            chamber: 'senate',
          })
        );
      trades.push(...senateTrades);
    }
  } catch (e) {
    console.error('Senate trades fetch error:', e);
  }

  return trades
    .sort(
      (a, b) =>
        new Date(b.transaction_date || b.disclosure_date).getTime() -
        new Date(a.transaction_date || a.disclosure_date).getTime()
    )
    .slice(0, limit);
}

export async function getCongressionalTradesByTicker(ticker: string): Promise<CongressionalTrade[]> {
  const all = await getRecentCongressionalTrades(365, 500);
  return all.filter((t) => t.ticker === ticker.toUpperCase());
}

export async function getTopCongressionalTickers(
  limit = 10
): Promise<{ ticker: string; count: number; buys: number; sells: number }[]> {
  const trades = await getRecentCongressionalTrades(90, 500);
  const tickerMap: Record<string, { count: number; buys: number; sells: number }> = {};

  trades.forEach((t) => {
    if (!tickerMap[t.ticker]) tickerMap[t.ticker] = { count: 0, buys: 0, sells: 0 };
    tickerMap[t.ticker].count++;
    if (t.type === 'Purchase') tickerMap[t.ticker].buys++;
    if (t.type.includes('Sale')) tickerMap[t.ticker].sells++;
  });

  return Object.entries(tickerMap)
    .map(([ticker, stats]) => ({ ticker, ...stats }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export const NOTABLE_CONGRESS = [
  'Nancy Pelosi',
  'Paul Pelosi',
  'Dan Crenshaw',
  'Tommy Tuberville',
  'Marjorie Taylor Greene',
  'Josh Gottheimer',
  'Brian Mast',
  'Ro Khanna',
];

export async function getNotableTraderActivity(): Promise<CongressionalTrade[]> {
  const all = await getRecentCongressionalTrades(90, 1000);
  return all
    .filter((t) =>
      NOTABLE_CONGRESS.some(
        (name) =>
          t.representative.toLowerCase().includes(name.toLowerCase().split(' ')[0]) ||
          t.representative.toLowerCase().includes(name.toLowerCase().split(' ').pop() || '')
      )
    )
    .slice(0, 20);
}
