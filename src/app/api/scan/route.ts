import { NextResponse } from 'next/server';
import { runMarketScan } from '@/lib/agents/scanner';
import { saveSignal, getRecentSignals } from '@/lib/db/signals';

export async function GET() {
  try {
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

    const signals = await runMarketScan();

    for (const signal of signals) {
      try {
        await saveSignal({
          ticker: signal.ticker,
          signal_type: signal.signal_type,
          strength: signal.strength,
          summary: signal.summary,
          status: 'pending',
          scanned_at: signal.scanned_at,
        });
      } catch (e) {
        console.error('Failed to save signal:', e);
      }
    }

    return NextResponse.json({
      signals,
      scanned_at: new Date().toISOString(),
      cache: 'MISS',
    });
  } catch (error) {
    console.error('Scan route error:', error);
    const message = error instanceof Error ? error.message : 'Scanner failed';
    return NextResponse.json({ error: message, signals: [] }, { status: 500 });
  }
}
