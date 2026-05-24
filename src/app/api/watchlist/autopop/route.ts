import { NextResponse } from 'next/server';
import { runWatchlistAutoPop } from '@/lib/services/watchlist-autopop';

export async function POST() {
  try {
    const result = await runWatchlistAutoPop();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Watchlist autopop error:', error);
    return NextResponse.json({ added: [], skipped: [], error: 'Auto-pop failed' });
  }
}
