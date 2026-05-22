import { NextRequest, NextResponse } from 'next/server';
import { getPortfolioHistory } from '@/lib/api/alpaca';

export async function GET(request: NextRequest) {
  try {
    const period = request.nextUrl.searchParams.get('period') || '1M';
    const timeframe = request.nextUrl.searchParams.get('timeframe') || '1D';

    const history = await getPortfolioHistory(period, timeframe);
    return NextResponse.json(history);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get history';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
