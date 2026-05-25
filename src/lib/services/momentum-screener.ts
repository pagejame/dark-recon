import { createAdminClient } from '@/lib/supabase/admin';

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';

export interface MomentumStock {
  ticker: string;
  price: number;
  change_1d: number;
  change_5d?: number;
  volume_ratio: number;
  relative_strength: number;
  momentum_score: number;
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  reason: string;
}

const SCAN_UNIVERSE = [
  'MSFT', 'AAPL', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'LLY', 'JPM', 'V',
  'UNH', 'XOM', 'MA', 'JNJ', 'HD', 'PG', 'COST', 'NFLX', 'AVGO', 'MRK',
  'CVX', 'WMT', 'KO', 'BAC', 'ABBV', 'PEP', 'CRM', 'MCD', 'TMO', 'ORCL',
  'AMD', 'GE', 'ADBE', 'QCOM', 'TXN', 'PM', 'ACN', 'DHR', 'WFC', 'SPGI',
  'ISRG', 'RTX', 'DIS', 'NEE', 'LOW', 'MS', 'GS', 'BX', 'UBER', 'INTU',
  'T', 'SCHW', 'PFE', 'AMGN', 'UNP', 'CAT', 'BKNG', 'AXP', 'HON', 'C',
  'CMCSA', 'TJX', 'SYK', 'IBM', 'AMAT', 'MDT', 'GD', 'DE', 'BSX', 'VRTX',
  'REGN', 'ADI', 'MU', 'GILD', 'LRCX', 'MMC', 'SO', 'CI', 'ZTS', 'COP',
  'ARM', 'SMCI', 'CRWD', 'PANW', 'SNOW', 'DDOG', 'NET', 'PLTR', 'COIN',
  'SHOP', 'SOFI', 'AFRM', 'RIVN', 'NIO', 'MRNA', 'BNTX',
  'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLC', 'XLY', 'XLP', 'XLRE', 'XLB', 'XLU',
];

interface FinnhubQuote {
  c?: number;
  dp?: number;
  v?: number;
  av?: number;
}

async function fetchQuote(ticker: string): Promise<FinnhubQuote | null> {
  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}`, {
      headers: { 'X-Finnhub-Token': FINNHUB_KEY },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.c || data.c === 0) return null;
    return data;
  } catch {
    return null;
  }
}

function calculateMomentumScore(changePct: number, volumeRatio: number): number {
  const priceScore = Math.min(50, Math.max(-50, changePct * 5)) + 50;
  const volumeScore = Math.min(100, volumeRatio * 25);
  return Math.min(100, priceScore * 0.7 + volumeScore * 0.3);
}

function getSignal(score: number): MomentumStock['signal'] {
  if (score >= 75) return 'strong_buy';
  if (score >= 60) return 'buy';
  if (score <= 25) return 'strong_sell';
  if (score <= 40) return 'sell';
  return 'neutral';
}

export async function runMomentumScreener(): Promise<{
  top_movers: MomentumStock[];
  top_gainers: MomentumStock[];
  top_losers: MomentumStock[];
  high_momentum: MomentumStock[];
  scan_count: number;
}> {
  const results: MomentumStock[] = [];
  const batchSize = 20;

  for (let i = 0; i < SCAN_UNIVERSE.length; i += batchSize) {
    const batch = SCAN_UNIVERSE.slice(i, i + batchSize);
    const quotes = await Promise.all(
      batch.map(async (ticker) => {
        const data = await fetchQuote(ticker);
        if (!data) return null;

        const changePct = data.dp || 0;
        const volume = data.v || 0;
        const avgVolume = data.av || volume;
        const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;
        const momentumScore = calculateMomentumScore(changePct, volumeRatio);
        const signal = getSignal(momentumScore);

        const reason =
          signal === 'strong_buy'
            ? `Up ${changePct.toFixed(2)}% with ${volumeRatio.toFixed(1)}x average volume — strong institutional buying`
            : signal === 'buy'
              ? `Up ${changePct.toFixed(2)}% with above-average volume — momentum building`
              : signal === 'strong_sell'
                ? `Down ${Math.abs(changePct).toFixed(2)}% with ${volumeRatio.toFixed(1)}x volume — heavy selling pressure`
                : signal === 'sell'
                  ? `Down ${Math.abs(changePct).toFixed(2)}% — weakness`
                  : 'Flat — no directional momentum';

        return {
          ticker,
          price: data.c!,
          change_1d: changePct,
          volume_ratio: Math.round(volumeRatio * 10) / 10,
          relative_strength: Math.round(momentumScore),
          momentum_score: momentumScore,
          signal,
          reason,
        } as MomentumStock;
      })
    );

    quotes.filter(Boolean).forEach((q) => results.push(q as MomentumStock));

    if (i + batchSize < SCAN_UNIVERSE.length) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  const sorted = [...results].sort((a, b) => b.momentum_score - a.momentum_score);

  return {
    top_movers: sorted.filter((s) => s.signal !== 'neutral').slice(0, 10),
    top_gainers: [...results].sort((a, b) => b.change_1d - a.change_1d).slice(0, 10),
    top_losers: [...results].sort((a, b) => a.change_1d - b.change_1d).slice(0, 10),
    high_momentum: sorted.filter((s) => ['strong_buy', 'buy'].includes(s.signal)).slice(0, 15),
    scan_count: results.length,
  };
}

export async function saveMomentumResults(
  results: Awaited<ReturnType<typeof runMomentumScreener>>
): Promise<void> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().split('T')[0];

  for (const stock of results.high_momentum.slice(0, 10)) {
    const { error } = await supabase.from('scanner_results').upsert(
      {
        scan_date: today,
        scan_type: 'momentum',
        ticker: stock.ticker,
        signal_strength: stock.relative_strength,
        signal_data: {
          change_1d: stock.change_1d,
          volume_ratio: stock.volume_ratio,
          signal: stock.signal,
        },
        claude_thesis: stock.reason,
        conviction_score: stock.signal === 'strong_buy' ? 8 : 7,
        added_to_watchlist: false,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'scan_date,ticker,scan_type' }
    );
    if (error) console.error(error);
  }
}
