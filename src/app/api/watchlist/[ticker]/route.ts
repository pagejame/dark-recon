import { NextResponse } from 'next/server';
import { removeFromWatchlist } from '@/lib/db/watchlist';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    const { ticker } = await params;
    await removeFromWatchlist(ticker);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Watchlist DELETE error:', error);
    return NextResponse.json({ error: 'Failed to remove ticker' }, { status: 500 });
  }
}
