import { NextRequest, NextResponse } from 'next/server';
import { runIntelligenceSweep, type IntelligenceSignal } from '@/lib/agents/intelligence';
import { createAdminClient } from '@/lib/supabase/admin';

let sweepCache: { signals: IntelligenceSignal[]; timestamp: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get('refresh') === 'true';

  if (!refresh && sweepCache && Date.now() - sweepCache.timestamp < CACHE_TTL) {
    return NextResponse.json({
      signals: sweepCache.signals,
      cache: 'HIT',
      swept_at: new Date(sweepCache.timestamp).toISOString(),
    });
  }

  try {
    const signals = await runIntelligenceSweep();

    try {
      const supabase = createAdminClient();
      for (const signal of signals.slice(0, 10)) {
        await supabase.from('intelligence_signals').insert({
          source: signal.source,
          signal_type: signal.signal_type,
          ticker: signal.ticker || null,
          headline: signal.headline,
          summary: signal.summary,
          url: signal.url || null,
          sentiment: signal.sentiment,
          strength: signal.strength,
          swept_at: signal.swept_at,
        });
      }
    } catch (e) {
      console.error('Intelligence DB save error:', e);
    }

    sweepCache = { signals, timestamp: Date.now() };

    return NextResponse.json({
      signals,
      cache: 'MISS',
      swept_at: new Date().toISOString(),
      count: signals.length,
    });
  } catch (error) {
    console.error('Intelligence sweep error:', error);
    return NextResponse.json({ signals: [], error: 'Sweep failed' }, { status: 500 });
  }
}
