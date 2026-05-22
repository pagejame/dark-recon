import { NextRequest, NextResponse } from 'next/server';
import { runMarketScan, type ScanResult } from '@/lib/agents/scanner';

const DEFAULT_WATCHLIST = [
  'SPY', 'QQQ', 'NVDA', 'AMD', 'TSLA', 'META', 'AAPL', 'MSFT', 'AMZN', 'GOOGL'
];

type CachedSignal = ScanResult & {
  id?: string;
  status?: string;
  created_at?: string;
};

// In-memory cache (resets on cold start but works for serverless)
let signalCache: { signals: CachedSignal[]; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  try {
    const fresh = request.nextUrl.searchParams.get('fresh') === 'true';
    
    // Return cache if valid and not forced fresh
    if (!fresh && signalCache && Date.now() - signalCache.timestamp < CACHE_TTL) {
      return NextResponse.json({
        signals: signalCache.signals,
        scanned_at: new Date(signalCache.timestamp).toISOString(),
        cache: 'HIT',
      });
    }

    // Try to get watchlist from DB, fall back to default
    let watchlist = DEFAULT_WATCHLIST;
    try {
      const { createClient } = await import('@/lib/supabase/server');
      const supabase = await createClient();
      const { data } = await supabase.from('watchlist').select('ticker');
      if (data && data.length > 0) {
        watchlist = data.map((w: { ticker: string }) => w.ticker);
      }
    } catch {
      // Use default watchlist silently
    }

    // Run the scan
    const signals = await runMarketScan(watchlist);

    // Try to persist signals to DB — non-fatal
    try {
      const { createClient } = await import('@/lib/supabase/server');
      const supabase = await createClient();
      
      for (const signal of signals) {
        // Check for duplicate in last hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: existing } = await supabase
          .from('signals')
          .select('id')
          .eq('ticker', signal.ticker)
          .eq('signal_type', signal.signal_type)
          .gte('created_at', oneHourAgo)
          .limit(1);
        
        if (!existing || existing.length === 0) {
          await supabase.from('signals').insert({
            ticker: signal.ticker,
            signal_type: signal.signal_type,
            strength: signal.strength,
            summary: signal.summary,
            status: 'pending',
            scanned_at: signal.scanned_at,
          });
        }
      }
    } catch {
      // DB persist failed — signals still returned to client
    }

    // Try to get all signals from DB for full history
    let allSignals: CachedSignal[] = signals;
    try {
      const { createClient } = await import('@/lib/supabase/server');
      const supabase = await createClient();
      const { data } = await supabase
        .from('signals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (data && data.length > 0) {
        allSignals = data;
      }
    } catch {
      // Use fresh signals only
    }

    // Update in-memory cache
    signalCache = { signals: allSignals, timestamp: Date.now() };

    return NextResponse.json({
      signals: allSignals,
      scanned_at: new Date().toISOString(),
      cache: 'MISS',
    });
  } catch (error) {
    console.error('Scan route error:', error);
    const message = error instanceof Error ? error.message : 'Scanner failed';
    return NextResponse.json({ error: message, signals: [] }, { status: 500 });
  }
}
