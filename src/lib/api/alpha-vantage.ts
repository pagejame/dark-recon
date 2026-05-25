const AV_KEY = process.env.ALPHA_VANTAGE_KEY || '';
const AV_BASE = 'https://www.alphavantage.co/query';

let requestsToday = 0;
let lastResetDate = new Date().toDateString();
const MAX_DAILY_REQUESTS = 20;

function checkRateLimit(): boolean {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    requestsToday = 0;
    lastResetDate = today;
  }
  if (requestsToday >= MAX_DAILY_REQUESTS) {
    console.log('Alpha Vantage daily limit reached');
    return false;
  }
  requestsToday++;
  return true;
}

export interface TechnicalSignal {
  ticker: string;
  rsi?: number;
  macd?: number;
  macd_signal?: number;
  macd_histogram?: number;
  bb_upper?: number;
  bb_middle?: number;
  bb_lower?: number;
  sma_50?: number;
  sma_200?: number;
  technical_bias: 'bullish' | 'bearish' | 'neutral';
  signals: string[];
}

async function fetchAV(params: Record<string, string>): Promise<Record<string, unknown> | null> {
  if (!AV_KEY) return null;
  if (!checkRateLimit()) return null;
  try {
    const url = new URL(AV_BASE);
    Object.entries({ ...params, apikey: AV_KEY }).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getTechnicalSignals(ticker: string): Promise<TechnicalSignal> {
  const result: TechnicalSignal = {
    ticker,
    technical_bias: 'neutral',
    signals: [],
  };

  const rsiData = await fetchAV({
    function: 'RSI',
    symbol: ticker,
    interval: 'daily',
    time_period: '14',
    series_type: 'close',
  });
  if (rsiData?.['Technical Analysis: RSI']) {
    const series = rsiData['Technical Analysis: RSI'] as Record<string, { RSI?: string }>;
    const latestDate = Object.keys(series)[0];
    result.rsi = parseFloat(series[latestDate]?.RSI || '50');
  }

  await new Promise((r) => setTimeout(r, 200));

  const macdData = await fetchAV({
    function: 'MACD',
    symbol: ticker,
    interval: 'daily',
    series_type: 'close',
  });
  if (macdData?.['Technical Analysis: MACD']) {
    const series = macdData['Technical Analysis: MACD'] as Record<
      string,
      { MACD?: string; MACD_Signal?: string; MACD_Hist?: string }
    >;
    const latestDate = Object.keys(series)[0];
    const macd = series[latestDate];
    result.macd = parseFloat(macd?.MACD || '0');
    result.macd_signal = parseFloat(macd?.MACD_Signal || '0');
    result.macd_histogram = parseFloat(macd?.MACD_Hist || '0');
  }

  const bullishSignals: string[] = [];
  const bearishSignals: string[] = [];

  if (result.rsi !== undefined) {
    if (result.rsi < 30) {
      bullishSignals.push(`RSI oversold at ${result.rsi.toFixed(1)} — potential reversal`);
    } else if (result.rsi > 70) {
      bearishSignals.push(`RSI overbought at ${result.rsi.toFixed(1)} — potential pullback`);
    } else if (result.rsi > 55) {
      bullishSignals.push(`RSI at ${result.rsi.toFixed(1)} — bullish momentum zone`);
    } else if (result.rsi < 45) {
      bearishSignals.push(`RSI at ${result.rsi.toFixed(1)} — bearish momentum zone`);
    }
  }

  if (result.macd_histogram !== undefined) {
    if (
      result.macd_histogram > 0 &&
      result.macd !== undefined &&
      result.macd_signal !== undefined &&
      result.macd > result.macd_signal
    ) {
      bullishSignals.push(
        `MACD bullish crossover — histogram positive at ${result.macd_histogram.toFixed(3)}`
      );
    } else if (result.macd_histogram < 0) {
      bearishSignals.push(
        `MACD bearish — histogram negative at ${result.macd_histogram.toFixed(3)}`
      );
    }
  }

  result.signals = [...bullishSignals, ...bearishSignals];
  result.technical_bias =
    bullishSignals.length > bearishSignals.length
      ? 'bullish'
      : bearishSignals.length > bullishSignals.length
        ? 'bearish'
        : 'neutral';

  return result;
}

export async function getTechnicalSignalsForTopCandidates(
  tickers: string[],
  maxTickers = 8
): Promise<TechnicalSignal[]> {
  const results: TechnicalSignal[] = [];
  const toAnalyze = tickers.slice(0, maxTickers);

  for (const ticker of toAnalyze) {
    const signal = await getTechnicalSignals(ticker);
    results.push(signal);
    await new Promise((r) => setTimeout(r, 500));
  }

  return results;
}
