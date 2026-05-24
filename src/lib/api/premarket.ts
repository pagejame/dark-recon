const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';

export interface PreMarketData {
  futures: {
    es: number | null;
    nq: number | null;
    ym: number | null;
    bias: 'bullish' | 'bearish' | 'neutral';
    summary: string;
    spy_change_pct?: number | null;
    qqq_change_pct?: number | null;
  };
  pre_market_movers: {
    ticker: string;
    price: number;
    change_pct: number;
    volume: number;
    reason?: string;
  }[];
  position_news: {
    ticker: string;
    headline: string;
    summary: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    published_at: string;
    url: string;
  }[];
  market_calendar: {
    is_market_open: boolean;
    next_open: string;
    is_holiday: boolean;
    holiday_name?: string;
  };
}

export async function getPositionNews(tickers: string[]): Promise<PreMarketData['position_news']> {
  const news: PreMarketData['position_news'] = [];
  const since = Math.floor((Date.now() - 16 * 60 * 60 * 1000) / 1000);

  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const res = await fetch(
          `${FINNHUB_BASE}/company-news?symbol=${ticker}&from=${new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString().split('T')[0]}&to=${new Date().toISOString().split('T')[0]}`,
          { headers: { 'X-Finnhub-Token': FINNHUB_KEY } }
        );
        if (!res.ok) return;
        const articles = await res.json();

        (Array.isArray(articles) ? articles : [])
          .filter((a: { datetime: number }) => a.datetime >= since)
          .slice(0, 2)
          .forEach((a: { headline?: string; summary?: string; datetime: number; url?: string }) => {
            news.push({
              ticker,
              headline: a.headline || '',
              summary: a.summary?.slice(0, 200) || '',
              sentiment: 'neutral',
              published_at: new Date(a.datetime * 1000).toISOString(),
              url: a.url || '',
            });
          });
      } catch {
        /* skip */
      }
    })
  );

  return news.sort(
    (a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
  );
}

export async function getMarketCalendar(): Promise<PreMarketData['market_calendar']> {
  try {
    const now = new Date();
    const hour = now.getUTCHours();
    const day = now.getUTCDay();
    const isWeekday = day >= 1 && day <= 5;
    const isMarketHours = hour >= 13 && hour < 20;

    const res = await fetch(`${FINNHUB_BASE}/stock/market-status?exchange=US`, {
      headers: { 'X-Finnhub-Token': FINNHUB_KEY },
    });

    if (res.ok) {
      const data = await res.json();
      return {
        is_market_open: data.isOpen || false,
        next_open: data.session || 'Monday 9:30AM ET',
        is_holiday: !data.isOpen && isWeekday && !isMarketHours ? false : false,
      };
    }
  } catch {
    /* fall through */
  }

  return {
    is_market_open: false,
    next_open: 'Tuesday 9:30AM ET',
    is_holiday: false,
  };
}

export async function getFuturesSnapshot(): Promise<PreMarketData['futures']> {
  try {
    const symbols = ['ES1!', 'NQ1!', 'YM1!', 'SPY', 'QQQ'];
    const results: Record<string, { c?: number; dp?: number; pc?: number }> = {};

    await Promise.all(
      symbols.map(async (sym) => {
        try {
          const res = await fetch(`${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(sym)}`, {
            headers: { 'X-Finnhub-Token': FINNHUB_KEY },
            signal: AbortSignal.timeout(4000),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.c) results[sym] = data;
          }
        } catch {
          /* skip */
        }
      })
    );

    const esData = results['ES1!'] || results['SPY'];
    const nqData = results['NQ1!'] || results['QQQ'];
    const ymData = results['YM1!'];

    const esPrice = esData?.c || null;
    const nqPrice = nqData?.c || null;
    const esChange = esData?.dp ?? (esData?.pc ? ((esData.c! - esData.pc) / esData.pc) * 100 : 0);
    const nqChange = nqData?.dp ?? (nqData?.pc ? ((nqData.c! - nqData.pc) / nqData.pc) * 100 : 0);

    const avgChange = (esChange + nqChange) / 2;
    const bias = avgChange > 0.3 ? 'bullish' : avgChange < -0.3 ? 'bearish' : 'neutral';

    const isFutures = !!results['ES1!'];
    const label = isFutures ? 'Futures' : 'ETF Proxy';

    const summary =
      bias === 'bullish'
        ? `${label}: ES ${esChange >= 0 ? '+' : ''}${esChange.toFixed(2)}% NQ ${nqChange >= 0 ? '+' : ''}${nqChange.toFixed(2)}% — Risk ON overnight`
        : bias === 'bearish'
          ? `${label}: ES ${esChange.toFixed(2)}% NQ ${nqChange.toFixed(2)}% — Risk OFF pressure`
          : `${label}: ES ${esChange >= 0 ? '+' : ''}${esChange.toFixed(2)}% NQ ${nqChange >= 0 ? '+' : ''}${nqChange.toFixed(2)}% — Flat overnight`;

    return {
      es: esPrice,
      nq: nqPrice,
      ym: ymData?.c || null,
      bias,
      summary,
      spy_change_pct: results['SPY']?.dp ?? esChange,
      qqq_change_pct: results['QQQ']?.dp ?? nqChange,
    };
  } catch {
    return {
      es: null,
      nq: null,
      ym: null,
      bias: 'neutral',
      summary: 'Market data unavailable',
      spy_change_pct: null,
      qqq_change_pct: null,
    };
  }
}

export interface PreMarketMover {
  ticker: string;
  price: number;
  change_pct: number;
  volume: number;
  direction: 'up' | 'down';
  reason?: string;
}

export async function getPreMarketMovers(): Promise<PreMarketMover[]> {
  const watchTickers = [
    'NVDA',
    'META',
    'AAPL',
    'MSFT',
    'AMZN',
    'GOOGL',
    'TSLA',
    'AMD',
    'LLY',
    'GM',
    'QQQ',
    'SPY',
    'XLE',
    'JPM',
    'GS',
    'PLTR',
    'ARM',
  ];

  const movers: PreMarketMover[] = [];

  await Promise.all(
    watchTickers.map(async (ticker) => {
      try {
        const res = await fetch(`${FINNHUB_BASE}/quote?symbol=${ticker}`, {
          headers: { 'X-Finnhub-Token': FINNHUB_KEY },
        });
        if (!res.ok) return;
        const data = await res.json();

        const changePct = data.dp || 0;
        const price = data.c || 0;
        const volume = data.v || 0;

        if (Math.abs(changePct) >= 1.5) {
          movers.push({
            ticker,
            price,
            change_pct: changePct,
            volume,
            direction: changePct >= 0 ? 'up' : 'down',
          });
        }
      } catch {
        /* skip */
      }
    })
  );

  return movers
    .sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct))
    .slice(0, 8);
}

export async function getPreMarketData(positionTickers: string[]): Promise<PreMarketData> {
  const [futures, positionNews, marketCalendar, movers] = await Promise.all([
    getFuturesSnapshot(),
    getPositionNews(positionTickers),
    getMarketCalendar(),
    getPreMarketMovers(),
  ]);

  return {
    futures,
    pre_market_movers: movers,
    position_news: positionNews,
    market_calendar: marketCalendar,
  };
}
