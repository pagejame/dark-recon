import { NextResponse } from 'next/server';
import { runMarketScan, type ScanResult } from '@/lib/agents/scanner';
import { getRecentSignals, type DbSignal } from '@/lib/db/signals';
import { getWatchlist } from '@/lib/db/watchlist';

const CACHE_WINDOW_MS = 5 * 60 * 1000;

function dbSignalToScanResult(signal: DbSignal): ScanResult {
  return {
    ticker: signal.ticker,
    signal_type: signal.signal_type,
    strength: signal.strength,
    summary: signal.summary,
    raw_data: signal.raw_data,
    scanned_at: signal.scanned_at || signal.created_at,
  };
}

export async function GET() {
  try {
    const recent = await getRecentSignals(20);
    const cutoff = Date.now() - CACHE_WINDOW_MS;
    const fresh = recent.filter((s) => new Date(s.created_at).getTime() > cutoff);

    if (fresh.length > 0) {
      const scannedAt = fresh[0].scanned_at;
      return NextResponse.json(
        { signals: fresh.map(dbSignalToScanResult), scanned_at: scannedAt },
        { headers: { 'X-Cache': 'HIT' } }
      );
    }

    const watchlist = await getWatchlist();
    const tickers =
      watchlist.length > 0
        ? watchlist.map((w) => w.ticker)
        : ['SPY', 'QQQ', 'NVDA', 'AMD', 'TSLA', 'META', 'AAPL', 'MSFT', 'AMZN', 'GOOGL'];

    const signals = await runMarketScan(tickers);
    return NextResponse.json(
      { signals, scanned_at: new Date().toISOString() },
      { headers: { 'X-Cache': 'MISS' } }
    );
  } catch {
    return NextResponse.json({ error: 'Scanner failed' }, { status: 500 });
  }
}
