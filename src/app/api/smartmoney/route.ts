import { NextRequest, NextResponse } from 'next/server';
import {
  getRecentCongressionalTrades,
  getTopCongressionalTickers,
  getNotableTraderActivity,
  type CongressionalTrade,
} from '@/lib/api/smartmoney';

interface SmartMoneyCacheData {
  recent_trades: CongressionalTrade[];
  top_tickers: { ticker: string; count: number; buys: number; sells: number }[];
  notable_activity: CongressionalTrade[];
  updated_at: string;
}

let cache: { data: SmartMoneyCacheData; timestamp: number } | null = null;

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker');

  if (!ticker && cache && Date.now() - cache.timestamp < 60 * 60 * 1000) {
    return NextResponse.json({ ...cache.data, cached: true });
  }

  try {
    const [recent, topTickers, notable] = await Promise.allSettled([
      getRecentCongressionalTrades(90, 100),
      getTopCongressionalTickers(15),
      getNotableTraderActivity(),
    ]);

    const data: SmartMoneyCacheData = {
      recent_trades: recent.status === 'fulfilled' ? recent.value : [],
      top_tickers: topTickers.status === 'fulfilled' ? topTickers.value : [],
      notable_activity: notable.status === 'fulfilled' ? notable.value : [],
      updated_at: new Date().toISOString(),
    };

    if (!ticker) {
      cache = { data, timestamp: Date.now() };
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Smart money error:', error);
    return NextResponse.json({
      error: 'Failed to load smart money data',
      recent_trades: [],
      top_tickers: [],
      notable_activity: [],
    });
  }
}
