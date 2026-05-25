import { NextResponse } from 'next/server';
import { getFearGreedIndex, getUpcomingEconomicEvents } from '@/lib/api/market-sentiment';
import { getRecentInsiderTrades } from '@/lib/api/fmp';

export const revalidate = 1800;

export async function GET() {
  try {
    const [fearGreed, events, insiders] = await Promise.all([
      getFearGreedIndex(),
      getUpcomingEconomicEvents(),
      getRecentInsiderTrades(10),
    ]);

    return NextResponse.json({
      fear_greed: fearGreed,
      economic_events: events,
      insider_trades: insiders.filter((t) => t.signal_strength === 'high').slice(0, 5),
    });
  } catch {
    return NextResponse.json({ fear_greed: null, economic_events: [], insider_trades: [] });
  }
}
