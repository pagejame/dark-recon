import { NextRequest, NextResponse } from 'next/server';
import {
  getRecentCongressionalTrades,
  getTopCongressionalTickers,
  getNotableTraderActivity,
} from '@/lib/api/smartmoney';

export async function GET(_request: NextRequest) {
  try {
    // Always fetch fresh — caching is handled in the service layer
    const [recent, topTickers, notable] = await Promise.allSettled([
      getRecentCongressionalTrades(90, 100),
      getTopCongressionalTickers(15),
      getNotableTraderActivity(),
    ]);

    const recentTrades = recent.status === 'fulfilled' ? recent.value : [];
    const top = topTickers.status === 'fulfilled' ? topTickers.value : [];
    const notableActivity = notable.status === 'fulfilled' ? notable.value : [];

    console.log('Smart money trades count:', recentTrades.length);
    console.log('Notable activity count:', notableActivity.length);

    return NextResponse.json({
      recent_trades: recentTrades,
      top_tickers: top,
      notable_activity: notableActivity,
      updated_at: new Date().toISOString(),
      trade_count: recentTrades.length,
    });
  } catch (error) {
    console.error('Smart money route error:', error);
    return NextResponse.json({
      error: 'Failed to load smart money data',
      recent_trades: [],
      top_tickers: [],
      notable_activity: [],
      trade_count: 0,
    });
  }
}
