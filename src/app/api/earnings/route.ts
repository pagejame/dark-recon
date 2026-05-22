import { NextRequest, NextResponse } from 'next/server';
import { getEarningsCalendar, type EarningsCalendarEvent } from '@/lib/api/finnhub';

let earningsCache: { data: EarningsCalendarEvent[]; timestamp: number; days: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function GET(request: NextRequest) {
  try {
    const days = parseInt(request.nextUrl.searchParams.get('days') || '7', 10);

    if (
      earningsCache &&
      earningsCache.days === days &&
      Date.now() - earningsCache.timestamp < CACHE_TTL
    ) {
      return NextResponse.json({
        earnings: earningsCache.data,
        cached: true,
        updated_at: new Date(earningsCache.timestamp).toISOString(),
      });
    }

    const earnings = await getEarningsCalendar(days);

    const filtered = (earnings as EarningsCalendarEvent[])
      .filter((e) => e.symbol && e.date)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    earningsCache = { data: filtered, timestamp: Date.now(), days };

    return NextResponse.json({
      earnings: filtered,
      cached: false,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Earnings route error:', error);
    const message = error instanceof Error ? error.message : 'Failed to load earnings';
    return NextResponse.json({ error: message, earnings: [] }, { status: 500 });
  }
}
