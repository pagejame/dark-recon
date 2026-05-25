import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export interface ShortInterestData {
  ticker: string;
  short_interest: number;
  short_float_pct: number;
  days_to_cover: number;
  squeeze_score: number;
  signal: 'squeeze_candidate' | 'high_short' | 'normal' | 'low_short';
  reason: string;
}

function rawNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'object' && value !== null && 'raw' in value) {
    return Number((value as { raw: number }).raw) || 0;
  }
  return Number(value) || 0;
}

async function fetchShortInterestYahoo(ticker: string) {
  try {
    const quote = await yahooFinance
      .quoteSummary(ticker, { modules: ['defaultKeyStatistics'] })
      .catch(() => null);
    return quote?.defaultKeyStatistics || null;
  } catch {
    return null;
  }
}

export async function getShortInterest(ticker: string): Promise<ShortInterestData | null> {
  try {
    const stats = await fetchShortInterestYahoo(ticker);
    if (!stats) return null;

    const shortPct = rawNumber(stats.shortPercentOfFloat) * 100;
    const daysToCover = rawNumber(stats.shortRatio);
    const sharesShort = rawNumber(stats.sharesShort);

    let squeezeScore = 0;
    if (shortPct > 30) squeezeScore += 50;
    else if (shortPct > 20) squeezeScore += 35;
    else if (shortPct > 10) squeezeScore += 20;

    if (daysToCover > 10) squeezeScore += 30;
    else if (daysToCover > 5) squeezeScore += 15;
    else if (daysToCover > 3) squeezeScore += 5;

    squeezeScore = Math.min(100, squeezeScore);

    const signal =
      squeezeScore >= 70
        ? ('squeeze_candidate' as const)
        : shortPct > 20
          ? ('high_short' as const)
          : shortPct < 5
            ? ('low_short' as const)
            : ('normal' as const);

    const reason =
      signal === 'squeeze_candidate'
        ? `${shortPct.toFixed(1)}% of float short with ${daysToCover.toFixed(1)} days to cover — high squeeze potential`
        : signal === 'high_short'
          ? `${shortPct.toFixed(1)}% of float short — elevated short interest`
          : `${shortPct.toFixed(1)}% short interest — normal range`;

    return {
      ticker,
      short_interest: sharesShort,
      short_float_pct: shortPct,
      days_to_cover: daysToCover,
      squeeze_score: squeezeScore,
      signal,
      reason,
    };
  } catch {
    return null;
  }
}

export async function scanForSqueezeSetups(tickers: string[]): Promise<ShortInterestData[]> {
  const results: ShortInterestData[] = [];
  const toScan = tickers.slice(0, 15);

  for (const ticker of toScan) {
    const data = await getShortInterest(ticker);
    if (data && data.signal === 'squeeze_candidate') {
      results.push(data);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  return results.sort((a, b) => b.squeeze_score - a.squeeze_score);
}
