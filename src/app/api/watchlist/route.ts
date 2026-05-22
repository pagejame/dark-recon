import { NextRequest, NextResponse } from 'next/server';
import { getWatchlist, addToWatchlist } from '@/lib/db/watchlist';

export async function GET() {
  try {
    const watchlist = await getWatchlist();
    return NextResponse.json({ watchlist });
  } catch (error) {
    console.error('Watchlist GET error:', error);
    return NextResponse.json({ watchlist: [], error: 'Failed to load watchlist' });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { ticker, notes } = await request.json();
    if (!ticker) return NextResponse.json({ error: 'Ticker required' }, { status: 400 });
    const item = await addToWatchlist(ticker, notes);
    return NextResponse.json({ item });
  } catch (error) {
    console.error('Watchlist POST error:', error);
    return NextResponse.json({ error: 'Failed to add ticker' }, { status: 500 });
  }
}
