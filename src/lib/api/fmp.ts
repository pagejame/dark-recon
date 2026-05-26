const FMP_KEY = process.env.FMP_API_KEY || '';
const FMP_BASE = 'https://financialmodelingprep.com/api';

let fmpRequestsToday = 0;
let fmpLastReset = new Date().toDateString();

function checkFMPLimit(): boolean {
  const today = new Date().toDateString();
  if (today !== fmpLastReset) {
    fmpRequestsToday = 0;
    fmpLastReset = today;
  }
  if (fmpRequestsToday >= 200) return false;
  fmpRequestsToday++;
  return true;
}

async function fetchFMP(endpoint: string): Promise<unknown> {
  if (!FMP_KEY || !checkFMPLimit()) return null;
  try {
    const res = await fetch(`${FMP_BASE}${endpoint}&apikey=${FMP_KEY}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface InsiderTrade {
  ticker: string;
  company: string;
  insider_name: string;
  insider_title: string;
  transaction_type: 'Purchase' | 'Sale';
  shares: number;
  price: number;
  dollar_value: number;
  filing_date: string;
  transaction_date: string;
  signal_strength: 'high' | 'medium' | 'low';
}

export async function getRecentInsiderTrades(limit = 20): Promise<InsiderTrade[]> {
  const data = await fetchFMP(`/v4/insider-trading?transactionType=P-Purchase&limit=${limit}&`);
  if (!Array.isArray(data)) return [];

  return data
    .map((t: Record<string, unknown>) => {
      const dollarValue =
        ((t.securitiesTransacted as number) || 0) * ((t.price as number) || 0);
      return {
        ticker: (t.symbol as string) || '',
        company: (t.reportingName as string) || '',
        insider_name: (t.reportingName as string) || '',
        insider_title: (t.typeOfOwner as string) || '',
        transaction_type: 'Purchase' as const,
        shares: (t.securitiesTransacted as number) || 0,
        price: (t.price as number) || 0,
        dollar_value: dollarValue,
        filing_date: (t.filingDate as string) || '',
        transaction_date: (t.transactionDate as string) || '',
        signal_strength:
          dollarValue >= 500000 ? ('high' as const) : dollarValue >= 100000 ? ('medium' as const) : ('low' as const),
      };
    })
    .filter((t: InsiderTrade) => t.ticker && t.dollar_value > 50000);
}

export interface AnalystRatingChange {
  ticker: string;
  analyst_company: string;
  from_grade: string;
  to_grade: string;
  action: 'upgrade' | 'downgrade' | 'initiate' | 'reiterate';
  date: string;
  price_target?: number;
  signal: 'bullish' | 'bearish' | 'neutral';
}

export async function getRecentAnalystChanges(limit = 20): Promise<AnalystRatingChange[]> {
  const data = await fetchFMP(`/v3/upgrades-downgrades-consensus?&`);
  if (!Array.isArray(data)) return [];

  return data
    .map((r: Record<string, unknown>) => {
      const actionStr = String(r.action || '').toLowerCase();
      const action = actionStr.includes('upgrade')
        ? ('upgrade' as const)
        : actionStr.includes('downgrade')
          ? ('downgrade' as const)
          : actionStr.includes('init')
            ? ('initiate' as const)
            : ('reiterate' as const);

      return {
        ticker: (r.symbol as string) || '',
        analyst_company: (r.gradingCompany as string) || '',
        from_grade: (r.previousGrade as string) || '',
        to_grade: (r.newGrade as string) || '',
        action,
        date: String(r.publishedDate || '').split('T')[0] || '',
        price_target: (r.priceTarget as number) || undefined,
        signal:
          action === 'upgrade' || action === 'initiate'
            ? ('bullish' as const)
            : action === 'downgrade'
              ? ('bearish' as const)
              : ('neutral' as const),
      };
    })
    .filter((r: AnalystRatingChange) => r.ticker)
    .slice(0, limit);
}

export interface PressRelease {
  ticker: string;
  title: string;
  date: string;
  url: string;
  is_material: boolean;
}

export async function getRecentPressReleases(limit = 30): Promise<PressRelease[]> {
  const data = await fetchFMP(`/v3/press-releases?limit=${limit}&`);
  if (!Array.isArray(data)) return [];

  const materialKeywords = [
    'contract',
    'acquisition',
    'merger',
    'fda',
    'approval',
    'partnership',
    'agreement',
    'raises',
    'guidance',
    'record',
    'breakthrough',
    'launch',
    'awarded',
    'wins',
    'beats',
    'raises guidance',
  ];

  return data
    .map((pr: Record<string, unknown>) => ({
      ticker: (pr.symbol as string) || '',
      title: (pr.title as string) || '',
      date: (pr.date as string) || '',
      url: (pr.url as string) || '',
      is_material: materialKeywords.some((kw) =>
        String(pr.title || '')
          .toLowerCase()
          .includes(kw)
      ),
    }))
    .filter((pr: PressRelease) => pr.ticker && pr.is_material);
}

export interface IPOEvent {
  ticker: string;
  company: string;
  ipo_date: string;
  price_range: string;
  shares_offered: number;
  exchange: string;
}

export async function getUpcomingIPOs(): Promise<IPOEvent[]> {
  const today = new Date().toISOString().split('T')[0];
  const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const data = await fetchFMP(`/v3/ipo_calendar?from=${today}&to=${nextMonth}&`);
  if (!Array.isArray(data)) return [];

  return data
    .map((ipo: Record<string, unknown>) => ({
      ticker: (ipo.symbol as string) || '',
      company: (ipo.company as string) || '',
      ipo_date: (ipo.date as string) || '',
      price_range: (ipo.priceRange as string) || '',
      shares_offered: (ipo.shares as number) || 0,
      exchange: (ipo.exchange as string) || '',
    }))
    .filter((ipo: IPOEvent) => ipo.ticker);
}

export interface EarningsSurprise {
  ticker: string;
  actual_eps: number;
  estimated_eps: number;
  surprise_pct: number;
  date: string;
  direction: 'beat' | 'miss';
}

export async function getRecentEarningsSurprises(limit = 30): Promise<EarningsSurprise[]> {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const data = await fetchFMP(`/v3/earning_calendar?from=${weekAgo}&to=${today}&`);
  if (!Array.isArray(data)) return [];

  return data
    .filter(
      (e: Record<string, unknown>) =>
        e.eps !== null && e.epsEstimated !== null && e.eps !== undefined
    )
    .map((e: Record<string, unknown>) => {
      const estimated = (e.epsEstimated as number) || 0;
      const actual = (e.eps as number) || 0;
      const surprise =
        estimated && estimated !== 0
          ? ((actual - estimated) / Math.abs(estimated)) * 100
          : 0;
      return {
        ticker: (e.symbol as string) || '',
        actual_eps: actual,
        estimated_eps: estimated,
        surprise_pct: surprise,
        date: (e.date as string) || '',
        direction: surprise >= 0 ? ('beat' as const) : ('miss' as const),
      };
    })
    .filter((e: EarningsSurprise) => e.ticker && Math.abs(e.surprise_pct) >= 5)
    .slice(0, limit);
}
