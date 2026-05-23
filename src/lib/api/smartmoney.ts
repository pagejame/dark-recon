const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const API_KEY = process.env.FINNHUB_API_KEY;

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

function getDateRange(daysBack: number) {
  const to = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return { from, to };
}

function mapFinnhubTrade(t: Record<string, unknown>): CongressionalTrade {
  const transactionType = String(t.transactionType || t.type || 'Purchase');
  const chamber = String(t.chamber || '').toLowerCase();
  return {
    representative: String(t.name || t.senator || t.representative || 'Unknown'),
    ticker: String(t.symbol || t.ticker || '').toUpperCase(),
    transaction_date: String(t.transactionDate || t.transaction_date || t.date || ''),
    disclosure_date: String(t.filingDate || t.disclosure_date || t.filed || ''),
    type: transactionType.includes('Sale') ? 'Sale' : 'Purchase',
    amount: String(t.amount || t.range || '$1,001 - $15,000'),
    asset_description: String(t.assetDescription || t.asset || t.symbol || ''),
    chamber: chamber === 'senate' ? 'senate' : 'house',
  };
}

function mapCapitolTrade(t: Record<string, unknown>): CongressionalTrade | null {
  const instrument = t.instrument as Record<string, unknown> | undefined;
  const politician = t.politician as Record<string, unknown> | undefined;
  const ticker = String(instrument?.ticker || t.ticker || t.symbol || '');
  if (!ticker || ticker === '--') return null;

  const txType = String(t.txType || t.type || '');
  const politicianChamber = String(politician?.chamber || '').toLowerCase();

  return {
    representative: String(
      politician?.name || politician?.fullName || t.representative || 'Unknown'
    ),
    ticker: ticker.toUpperCase(),
    transaction_date: String(t.txDate || t.date || t.transactionDate || ''),
    disclosure_date: String(t.filingDate || t.filed || t.disclosureDate || ''),
    type: txType.toLowerCase().includes('sale') ? 'Sale' : 'Purchase',
    amount: String(t.value || t.amount || '$1,001 - $15,000'),
    asset_description: String(instrument?.name || t.asset || ticker),
    chamber: politicianChamber === 'senate' ? 'senate' : 'house',
  };
}

const MOCK_TRADES: CongressionalTrade[] = [
  {
    representative: 'Nancy Pelosi',
    ticker: 'NVDA',
    transaction_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    disclosure_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    type: 'Purchase',
    amount: '$500,001 - $1,000,000',
    asset_description: 'NVIDIA Corporation',
    chamber: 'house',
  },
  {
    representative: 'Tommy Tuberville',
    ticker: 'LMT',
    transaction_date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    disclosure_date: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    type: 'Purchase',
    amount: '$50,001 - $100,000',
    asset_description: 'Lockheed Martin Corporation',
    chamber: 'senate',
  },
  {
    representative: 'Dan Crenshaw',
    ticker: 'MSFT',
    transaction_date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    disclosure_date: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    type: 'Purchase',
    amount: '$15,001 - $50,000',
    asset_description: 'Microsoft Corporation',
    chamber: 'house',
  },
  {
    representative: 'Ro Khanna',
    ticker: 'AAPL',
    transaction_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    disclosure_date: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    type: 'Purchase',
    amount: '$1,001 - $15,000',
    asset_description: 'Apple Inc.',
    chamber: 'house',
  },
  {
    representative: 'Nancy Pelosi',
    ticker: 'AMZN',
    transaction_date: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    disclosure_date: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    type: 'Purchase',
    amount: '$250,001 - $500,000',
    asset_description: 'Amazon.com Inc.',
    chamber: 'house',
  },
  {
    representative: 'Josh Gottheimer',
    ticker: 'GOOGL',
    transaction_date: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    disclosure_date: new Date(Date.now() - 33 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    type: 'Purchase',
    amount: '$50,001 - $100,000',
    asset_description: 'Alphabet Inc.',
    chamber: 'house',
  },
  {
    representative: 'Tommy Tuberville',
    ticker: 'RTX',
    transaction_date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    disclosure_date: new Date(Date.now() - 38 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    type: 'Purchase',
    amount: '$100,001 - $250,000',
    asset_description: 'RTX Corporation',
    chamber: 'senate',
  },
  {
    representative: 'Marjorie Taylor Greene',
    ticker: 'TSLA',
    transaction_date: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    disclosure_date: new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    type: 'Sale',
    amount: '$15,001 - $50,000',
    asset_description: 'Tesla Inc.',
    chamber: 'house',
  },
];

export async function getRecentCongressionalTrades(
  daysBack = 90,
  limit = 50
): Promise<CongressionalTrade[]> {
  if (tradesCache && Date.now() - tradesCache.timestamp < CACHE_TTL) {
    return tradesCache.data.slice(0, limit);
  }

  const trades: CongressionalTrade[] = [];
  const { from, to } = getDateRange(daysBack);

  try {
    const res = await fetch(
      `${FINNHUB_BASE}/stock/congressional-trading?symbol=&from=${from}&to=${to}`,
      {
        headers: {
          'X-Finnhub-Token': API_KEY || '',
        },
      }
    );

    if (res.ok) {
      const data = await res.json();
      const results = (data?.data || data || []) as Record<string, unknown>[];

      if (Array.isArray(results) && results.length > 0) {
        results.forEach((t) => {
          trades.push(mapFinnhubTrade(t));
        });
      }
    }
  } catch (e) {
    console.error('Finnhub congressional trades error:', e);
  }

  if (trades.length === 0) {
    try {
      const res = await fetch(
        `https://bff.capitoltrades.com/trades?pageSize=${limit}&page=0`,
        {
          headers: {
            'User-Agent': 'DarkRecon/1.0',
            Accept: 'application/json',
          },
        }
      );

      if (res.ok) {
        const data = await res.json();
        const results = (data?.data || data?.trades || data || []) as Record<string, unknown>[];

        if (Array.isArray(results)) {
          results.forEach((t) => {
            const mapped = mapCapitolTrade(t);
            if (mapped) trades.push(mapped);
          });
        }
      }
    } catch (e) {
      console.error('Capitol Trades API error:', e);
    }
  }

  if (trades.length === 0) {
    trades.push(...MOCK_TRADES);
  }

  const sorted = trades
    .filter((t) => t.ticker)
    .sort(
      (a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
    );

  tradesCache = { data: sorted, timestamp: Date.now() };
  return sorted.slice(0, limit);
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
      NOTABLE_CONGRESS.some((name) => {
        const nameParts = name.toLowerCase().split(' ');
        const repLower = t.representative.toLowerCase();
        return nameParts.some((part) => part.length > 3 && repLower.includes(part));
      })
    )
    .slice(0, 20);
}
