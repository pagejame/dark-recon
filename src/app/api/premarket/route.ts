import { NextResponse } from 'next/server';
import {
  getPreMarketMovers,
  getFuturesSnapshot,
  getPositionNews,
  getMarketCalendar,
} from '@/lib/api/premarket';
import { getPositions } from '@/lib/api/alpaca';

interface PremarketCache {
  movers: Awaited<ReturnType<typeof getPreMarketMovers>>;
  futures: Awaited<ReturnType<typeof getFuturesSnapshot>> | null;
  position_news: Awaited<ReturnType<typeof getPositionNews>>;
  is_market_open: boolean;
  updated_at: string;
}

let cache: { data: PremarketCache; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json({ ...cache.data, cached: true });
  }

  try {
    const positions = await getPositions();
    const tickers = (Array.isArray(positions) ? positions : [])
      .map((p: { symbol?: string }) => p.symbol)
      .filter(Boolean) as string[];

    const [movers, futures, news, calendar] = await Promise.allSettled([
      getPreMarketMovers(),
      getFuturesSnapshot(),
      getPositionNews(tickers),
      getMarketCalendar(),
    ]);

    const data: PremarketCache = {
      movers: movers.status === 'fulfilled' ? movers.value : [],
      futures: futures.status === 'fulfilled' ? futures.value : null,
      position_news: news.status === 'fulfilled' ? news.value : [],
      is_market_open: calendar.status === 'fulfilled' ? calendar.value.is_market_open : false,
      updated_at: new Date().toISOString(),
    };

    cache = { data, timestamp: Date.now() };
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({
      movers: [],
      futures: null,
      position_news: [],
      is_market_open: false,
      updated_at: new Date().toISOString(),
    });
  }
}
