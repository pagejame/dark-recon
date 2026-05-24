export interface OptionsFlowSignal {
  ticker: string;
  type: 'call' | 'put';
  strike: number;
  expiry: string;
  volume: number;
  open_interest: number;
  volume_oi_ratio: number;
  implied_volatility: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  signal_strength: 'high' | 'medium' | 'low';
  description: string;
}

const FLOW_TICKERS = [
  'NVDA',
  'META',
  'AAPL',
  'MSFT',
  'AMZN',
  'TSLA',
  'AMD',
  'SPY',
  'QQQ',
  'LLY',
  'XLE',
  'GM',
];

interface OptionsSnapshotRow {
  volume?: number;
  openInterest?: number;
  impliedVolatility?: number;
}

export async function getUnusualOptionsFlow(): Promise<OptionsFlowSignal[]> {
  const signals: OptionsFlowSignal[] = [];

  await Promise.all(
    FLOW_TICKERS.slice(0, 6).map(async (ticker) => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0];

        const res = await fetch(
          `https://data.alpaca.markets/v1beta1/options/snapshots/${ticker}?feed=indicative&expiration_date_gte=${today}&expiration_date_lte=${thirtyDays}&limit=100`,
          {
            headers: {
              'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
              'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET || '',
            },
          }
        );

        if (!res.ok) return;
        const data = await res.json();
        const snapshots = (data?.snapshots || {}) as Record<string, OptionsSnapshotRow>;

        Object.entries(snapshots).forEach(([symbol, snap]) => {
          const volume = snap?.volume || 0;
          const oi = snap?.openInterest || 1;
          const ratio = volume / oi;
          const iv = (snap?.impliedVolatility || 0) * 100;

          if (volume > 500 && ratio > 0.5) {
            const typeIndex = Math.max(symbol.lastIndexOf('C'), symbol.lastIndexOf('P'));
            const typeChar = typeIndex >= 0 && symbol[typeIndex] === 'C' ? 'call' : 'put';
            const strike = parseInt(symbol.slice(typeIndex + 1), 10) / 1000;
            const expiry = symbol.slice(typeIndex - 6, typeIndex);

            const sentiment = typeChar === 'call' ? 'bullish' : 'bearish';
            const strength = ratio > 2 ? 'high' : ratio > 1 ? 'medium' : 'low';

            signals.push({
              ticker,
              type: typeChar,
              strike,
              expiry,
              volume,
              open_interest: oi,
              volume_oi_ratio: Math.round(ratio * 100) / 100,
              implied_volatility: Math.round(iv),
              sentiment,
              signal_strength: strength,
              description: `${ticker} ${typeChar.toUpperCase()} $${strike} — ${volume.toLocaleString()} contracts (${(ratio * 100).toFixed(0)}% of OI). ${sentiment === 'bullish' ? 'Bullish flow' : 'Bearish flow'} detected.`,
            });
          }
        });
      } catch {
        /* skip */
      }
    })
  );

  return signals.sort((a, b) => b.volume_oi_ratio - a.volume_oi_ratio).slice(0, 10);
}
