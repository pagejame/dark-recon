import { NextRequest, NextResponse } from 'next/server';
import { runWatchlistAutoPop } from '@/lib/services/watchlist-autopop';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runWatchlistAutoPop();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Watchlist autopop cron error:', error);
    return NextResponse.json({ added: [], skipped: [], error: 'Auto-pop failed' }, { status: 500 });
  }
}
