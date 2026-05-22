import { NextRequest, NextResponse } from 'next/server';
import { runMarketScan } from '@/lib/agents/scanner';
import { saveSignal, getRecentSignals } from '@/lib/db/signals';
import { getWatchlist } from '@/lib/db/watchlist';
import type { DbSignal } from '@/lib/db/signals';

export async function GET(request: NextRequest) {
  try {
    const forceFresh = new URL(request.url).searchParams.get('fresh') === 'true';

    if (!forceFresh) {
      const cached = await getRecentSignals(20);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const fresh = cached.filter(
        (s) => new Date(s.scanned_at || s.created_at) > fiveMinutesAgo
      );

      if (fresh.length > 0) {
        return NextResponse.json({
          signals: fresh,
          scanned_at: new Date().toISOString(),
          cache: 'HIT',
        });
      }
    }

    const watchlist = await getWatchlist();
    const tickers =
      watchlist.length > 0 ? watchlist.map((w) => w.ticker) : undefined;

    const signals = await runMarketScan(tickers);

    const persisted: DbSignal[] = [];
    for (const signal of signals) {
      try {
        const saved = await saveSignal({
          ticker: signal.ticker,
          signal_type: signal.signal_type,
          strength: signal.strength,
          summary: signal.summary,
          status: 'pending',
          scanned_at: signal.scanned_at,
        });
        if (saved) persisted.push(saved as DbSignal);
      } catch (e) {
        console.error('Failed to save signal:', e);
      }
    }

    return NextResponse.json({
      signals: persisted.length > 0 ? persisted : await getRecentSignals(20),
      scanned_at: new Date().toISOString(),
      cache: 'MISS',
    });
  } catch (error) {
    console.error('Scan route error:', error);
    const message = error instanceof Error ? error.message : 'Scanner failed';
    return NextResponse.json({ error: message, signals: [] }, { status: 500 });
  }
}
