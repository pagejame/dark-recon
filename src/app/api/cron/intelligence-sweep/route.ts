// REQUIRED: Set CRON_SECRET in Vercel environment variables
// Generate with: openssl rand -hex 32
// Add to Vercel: Settings -> Environment Variables -> CRON_SECRET

import { NextRequest, NextResponse } from 'next/server';
import { runIntelligenceSweep } from '@/lib/agents/intelligence';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const signals = await runIntelligenceSweep();
    const supabase = createAdminClient();

    let saved = 0;
    for (const signal of signals.slice(0, 10)) {
      try {
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
        saved++;
      } catch {
        // skip duplicates
      }
    }

    await supabase.from('cron_runs').insert({
      job_name: 'intelligence-sweep',
      status: 'success',
      results: { signals_found: signals.length, saved },
      duration_ms: Date.now() - startTime,
      ran_at: new Date().toISOString(),
    });

    return NextResponse.json({ signals_found: signals.length, saved });
  } catch (error) {
    console.error('Intelligence sweep cron error:', error);
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 });
  }
}
