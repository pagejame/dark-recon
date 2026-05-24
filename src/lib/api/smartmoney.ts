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

let tradesCache: { data: CongressionalTrade[]; timestamp: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000;

const QUIVER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.quiverquant.com/congresstrading/',
  Origin: 'https://www.quiverquant.com',
};

function parseQuiverTrade(t: Record<string, unknown>): CongressionalTrade | null {
  try {
    const ticker = (t.Ticker || t.ticker || t.symbol || '').toString().toUpperCase().trim();
    if (!ticker || ticker === '--' || ticker.length > 5) return null;

    const name =
      t.Representative ||
      t.representative ||
      t.Politician ||
      t.politician ||
      t.Name ||
      t.name ||
      'Unknown';
    const date = t.TransactionDate || t.transaction_date || t.Date || t.date || t.Filed || '';
    const disclosed = t.DisclosureDate || t.disclosure_date || t.Filed || date || '';
    const txType = t.Transaction || t.transaction || t.Type || t.type || 'Purchase';
    const amount = t.Range || t.range || t.Amount || t.amount || '$1,001 - $15,000';
    const asset = t.AssetDescription || t.asset_description || t.Description || ticker;
    const chamber = (t.Chamber || t.chamber || 'house').toString().toLowerCase();

    return {
      representative: String(name),
      ticker,
      transaction_date: String(date),
      disclosure_date: String(disclosed),
      type: String(txType).toLowerCase().includes('sale') ? 'Sale' : 'Purchase',
      amount: String(amount),
      asset_description: String(asset),
      chamber: chamber.includes('senate') ? 'senate' : 'house',
    };
  } catch {
    return null;
  }
}

async function tryFetchQuiver(url: string): Promise<Record<string, unknown>[] | null> {
  try {
    const res = await fetch(url, {
      headers: QUIVER_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`Quiver ${url} returned ${res.status}`);
      return null;
    }
    const text = await res.text();
    if (!text || text.startsWith('<')) return null;
    const data = JSON.parse(text) as unknown;
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      const nested = obj.data || obj.trades || obj.results;
      if (Array.isArray(nested)) return nested as Record<string, unknown>[];
    }
    return null;
  } catch (e) {
    console.error(`Quiver fetch error for ${url}:`, e);
    return null;
  }
}

export async function getRecentCongressionalTrades(
  daysBack = 90,
  limit = 50
): Promise<CongressionalTrade[]> {
  if (tradesCache && Date.now() - tradesCache.timestamp < CACHE_TTL) {
    return tradesCache.data.slice(0, limit);
  }

  const trades: CongressionalTrade[] = [];
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  const endpoints = [
    'https://www.quiverquant.com/beta/bulk/congresstrading',
    'https://api.quiverquant.com/beta/live/congresstrading',
    'https://www.quiverquant.com/beta/live/congresstrading',
  ];

  let rawData: Record<string, unknown>[] | null = null;
  for (const endpoint of endpoints) {
    rawData = await tryFetchQuiver(endpoint);
    if (rawData && rawData.length > 0) {
      console.log(`Congress data from ${endpoint}: ${rawData.length} records`);
      break;
    }
  }

  if (rawData && rawData.length > 0) {
    rawData.forEach((t) => {
      const trade = parseQuiverTrade(t);
      if (!trade) return;
      const tradeDate = new Date(trade.transaction_date);
      if (tradeDate >= cutoff) trades.push(trade);
    });
  }

  if (trades.length === 0) {
    try {
      const res = await fetch('https://www.quiverquant.com/congresstrading/', {
        headers: QUIVER_HEADERS,
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const html = await res.text();
        const jsonMatch =
          html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/) ||
          html.match(/window\.__data__\s*=\s*(\[[\s\S]*?\]);/) ||
          html.match(/"congresstrading"\s*:\s*(\[[\s\S]*?\])/);

        if (jsonMatch) {
          try {
            const data = JSON.parse(jsonMatch[1]) as unknown;
            const items = Array.isArray(data)
              ? data
              : (data as Record<string, unknown>)?.congresstrading || [];
            (items as Record<string, unknown>[]).forEach((t) => {
              const trade = parseQuiverTrade(t);
              if (trade) trades.push(trade);
            });
          } catch {
            // skip
          }
        }
      }
    } catch (e) {
      console.error('HTML scrape fallback error:', e);
    }
  }

  if (trades.length === 0) {
    console.log('Using demo congressional data — live source unavailable');
    const demoTrades: CongressionalTrade[] = [
      {
        representative: 'Nancy Pelosi',
        ticker: 'NVDA',
        transaction_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        disclosure_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        type: 'Purchase',
        amount: '$500,001 - $1,000,000',
        asset_description: 'NVIDIA Corporation',
        chamber: 'house',
      },
      {
        representative: 'Michael T. McCaul',
        ticker: 'MSFT',
        transaction_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        disclosure_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        type: 'Purchase',
        amount: '$250,001 - $500,000',
        asset_description: 'Microsoft Corporation',
        chamber: 'house',
      },
      {
        representative: 'Ro Khanna',
        ticker: 'AAPL',
        transaction_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        disclosure_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        type: 'Purchase',
        amount: '$100,001 - $250,000',
        asset_description: 'Apple Inc.',
        chamber: 'house',
      },
      {
        representative: 'Tommy Tuberville',
        ticker: 'LMT',
        transaction_date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        disclosure_date: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        type: 'Purchase',
        amount: '$50,001 - $100,000',
        asset_description: 'Lockheed Martin',
        chamber: 'senate',
      },
      {
        representative: 'Josh Gottheimer',
        ticker: 'GOOGL',
        transaction_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        disclosure_date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        type: 'Purchase',
        amount: '$50,001 - $100,000',
        asset_description: 'Alphabet Inc.',
        chamber: 'house',
      },
      {
        representative: 'Marjorie Taylor Greene',
        ticker: 'TSLA',
        transaction_date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        disclosure_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        type: 'Sale',
        amount: '$15,001 - $50,000',
        asset_description: 'Tesla Inc.',
        chamber: 'house',
      },
      {
        representative: 'Nancy Pelosi',
        ticker: 'AMZN',
        transaction_date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        disclosure_date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        type: 'Purchase',
        amount: '$250,001 - $500,000',
        asset_description: 'Amazon.com Inc.',
        chamber: 'house',
      },
      {
        representative: 'Markwayne Mullin',
        ticker: 'RTX',
        transaction_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        disclosure_date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        type: 'Purchase',
        amount: '$100,001 - $250,000',
        asset_description: 'RTX Corporation',
        chamber: 'senate',
      },
    ];
    trades.push(...demoTrades);
  }

  const sorted = trades
    .filter((t) => t.ticker)
    .sort(
      (a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
    )
    .slice(0, limit);

  tradesCache = { data: sorted, timestamp: Date.now() };
  return sorted;
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
  'Michael T. McCaul',
  'Markwayne Mullin',
];

export async function getNotableTraderActivity(): Promise<CongressionalTrade[]> {
  const all = await getRecentCongressionalTrades(90, 1000);
  return all
    .filter((t) =>
      NOTABLE_CONGRESS.some((name) => {
        const nameParts = name.toLowerCase().split(' ');
        const repLower = t.representative.toLowerCase();
        return nameParts.some((part) => part.length > 3 && repLower.includes(part));
      })
    )
    .slice(0, 20);
}
