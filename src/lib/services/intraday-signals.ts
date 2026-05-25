const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';
const ALPACA_BASE = 'https://data.alpaca.markets';
const ALPACA_KEY = process.env.ALPACA_API_KEY || '';
const ALPACA_SECRET = process.env.ALPACA_API_SECRET || '';

interface IntradayBar {
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface IntradaySignal {
  ticker: string;
  setup_type:
    | 'gap_and_go'
    | 'vwap_reclaim'
    | 'orb_breakout'
    | 'momentum_continuation'
    | 'reversal_short'
    | 'high_of_day_break';
  direction: 'long' | 'short';
  current_price: number;
  entry_price: number;
  profit_target_1: number;
  profit_target_2: number;
  profit_target_3?: number;
  stop_loss: number;
  conviction: number;
  reason: string;
  volume_confirmation: boolean;
  vwap?: number;
  high_of_day?: number;
  low_of_day?: number;
  opening_range_high?: number;
  opening_range_low?: number;
}

async function getIntradayBars(ticker: string): Promise<IntradayBar[] | null> {
  try {
    const now = new Date();
    const marketOpen = new Date(now);
    marketOpen.setHours(9, 30, 0, 0);
    const start = marketOpen.toISOString();

    const res = await fetch(
      `${ALPACA_BASE}/v2/stocks/${ticker}/bars?timeframe=5Min&start=${start}&feed=iex&limit=50`,
      {
        headers: {
          'APCA-API-KEY-ID': ALPACA_KEY,
          'APCA-API-SECRET-KEY': ALPACA_SECRET,
        },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.bars || null;
  } catch {
    return null;
  }
}

function calculateVWAP(bars: IntradayBar[]): number {
  if (!bars || bars.length === 0) return 0;
  let totalPV = 0;
  let totalVolume = 0;
  bars.forEach((bar) => {
    const typicalPrice = (bar.h + bar.l + bar.c) / 3;
    totalPV += typicalPrice * bar.v;
    totalVolume += bar.v;
  });
  return totalVolume > 0 ? totalPV / totalVolume : 0;
}

export async function detectIntradaySetups(tickers: string[]): Promise<IntradaySignal[]> {
  const signals: IntradaySignal[] = [];
  const now = new Date();
  const marketOpenTime = new Date(now);
  marketOpenTime.setHours(9, 30, 0, 0);
  const minutesSinceOpen = (now.getTime() - marketOpenTime.getTime()) / (1000 * 60);

  const hour = now.getUTCHours();
  const day = now.getUTCDay();
  const isMarketHours = day >= 1 && day <= 5 && hour >= 13 && hour < 20;
  if (!isMarketHours) return signals;

  await Promise.all(
    tickers.slice(0, 20).map(async (ticker) => {
      try {
        const quoteRes = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}`, {
          headers: { 'X-Finnhub-Token': FINNHUB_KEY },
          signal: AbortSignal.timeout(3000),
        });
        if (!quoteRes.ok) return;
        const quote = await quoteRes.json();

        const currentPrice = quote.c || 0;
        const prevClose = quote.pc || currentPrice;
        const highOfDay = quote.h || currentPrice;
        const lowOfDay = quote.l || currentPrice;
        const changePct = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

        if (currentPrice === 0) return;

        const bars = await getIntradayBars(ticker);
        const vwap = bars ? calculateVWAP(bars) : 0;

        const openingBars = bars?.slice(0, 3) || [];
        const orbHigh =
          openingBars.length > 0 ? Math.max(...openingBars.map((b) => b.h)) : highOfDay;
        const orbLow =
          openingBars.length > 0 ? Math.min(...openingBars.map((b) => b.l)) : lowOfDay;

        if (changePct >= 2 && minutesSinceOpen < 60 && currentPrice > vwap && vwap > 0) {
          const entryPrice = currentPrice;
          signals.push({
            ticker,
            setup_type: 'gap_and_go',
            direction: 'long',
            current_price: currentPrice,
            entry_price: entryPrice,
            profit_target_1: entryPrice * 1.02,
            profit_target_2: entryPrice * 1.05,
            stop_loss: entryPrice * 0.985,
            conviction: Math.min(10, 6 + Math.floor(changePct / 2)),
            reason: `Gapping +${changePct.toFixed(2)}% above VWAP $${vwap.toFixed(2)} — momentum continuation play`,
            volume_confirmation: true,
            vwap,
            high_of_day: highOfDay,
            low_of_day: lowOfDay,
            opening_range_high: orbHigh,
            opening_range_low: orbLow,
          });
        }

        if (minutesSinceOpen >= 15 && minutesSinceOpen < 90 && currentPrice > orbHigh && orbHigh > 0) {
          const breakoutPct = ((currentPrice - orbHigh) / orbHigh) * 100;
          if (breakoutPct <= 2) {
            const entryPrice = currentPrice;
            signals.push({
              ticker,
              setup_type: 'orb_breakout',
              direction: 'long',
              current_price: currentPrice,
              entry_price: entryPrice,
              profit_target_1: entryPrice * 1.02,
              profit_target_2: entryPrice * 1.05,
              stop_loss: orbHigh * 0.99,
              conviction: 8,
              reason: `ORB breakout: broke above $${orbHigh.toFixed(2)} opening range high — trend day signal`,
              volume_confirmation: true,
              vwap,
              opening_range_high: orbHigh,
              opening_range_low: orbLow,
            });
          }
        }

        if (vwap > 0 && currentPrice > vwap && currentPrice < vwap * 1.005) {
          const entryPrice = currentPrice;
          signals.push({
            ticker,
            setup_type: 'vwap_reclaim',
            direction: 'long',
            current_price: currentPrice,
            entry_price: entryPrice,
            profit_target_1: entryPrice * 1.02,
            profit_target_2: entryPrice * 1.04,
            stop_loss: vwap * 0.99,
            conviction: 7,
            reason: `VWAP reclaim at $${vwap.toFixed(2)} — long bias restored, buyers stepping in`,
            volume_confirmation: true,
            vwap,
          });
        }

        if (currentPrice >= highOfDay * 0.999 && changePct > 3 && minutesSinceOpen > 30) {
          const entryPrice = currentPrice;
          signals.push({
            ticker,
            setup_type: 'high_of_day_break',
            direction: 'long',
            current_price: currentPrice,
            entry_price: entryPrice,
            profit_target_1: entryPrice * 1.02,
            profit_target_2: entryPrice * 1.05,
            profit_target_3: entryPrice * 1.1,
            stop_loss: entryPrice * 0.985,
            conviction: 8,
            reason: `New high of day at $${highOfDay.toFixed(2)} — up ${changePct.toFixed(2)}% momentum building`,
            volume_confirmation: true,
            high_of_day: highOfDay,
          });
        }

        if (changePct >= 8 && currentPrice < highOfDay * 0.99 && minutesSinceOpen > 45) {
          const entryPrice = currentPrice;
          signals.push({
            ticker,
            setup_type: 'reversal_short',
            direction: 'short',
            current_price: currentPrice,
            entry_price: entryPrice,
            profit_target_1: entryPrice * 0.98,
            profit_target_2: entryPrice * 0.95,
            stop_loss: highOfDay * 1.005,
            conviction: 7,
            reason: `Extended ${changePct.toFixed(2)}% off HOD, fading momentum — reversal short setup`,
            volume_confirmation: true,
            high_of_day: highOfDay,
            vwap,
          });
        }
      } catch {
        /* skip */
      }
    })
  );

  return signals.sort((a, b) => b.conviction - a.conviction).slice(0, 10);
}
