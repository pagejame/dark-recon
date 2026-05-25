import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const today = new Date().toISOString().split('T')[0];

    const [signalsResult, thesesResult] = await Promise.all([
      supabase
        .from('signals')
        .select('ticker, strength, source, status, created_at')
        .eq('status', 'pending')
        .gte('created_at', `${today}T00:00:00Z`)
        .order('created_at', { ascending: false }),
      supabase
        .from('theses')
        .select('ticker, conviction_score, auto_generated, created_at')
        .eq('auto_generated', true)
        .gte('created_at', `${today}T00:00:00Z`)
        .order('created_at', { ascending: false }),
    ]);

    const signals = signalsResult.data || [];
    const theses = thesesResult.data || [];
    const highConviction = theses.filter(
      (t: { conviction_score: number | null }) => (t.conviction_score || 0) >= 8
    );

    return NextResponse.json({
      signals_today: signals.length,
      theses_built: theses.length,
      high_conviction: highConviction.length,
      pipeline_active: signals.length > 0,
      top_signals: signals.slice(0, 5).map((s: { ticker: string; strength: string; source: string }) => ({
        ticker: s.ticker,
        strength: s.strength,
        source: s.source,
      })),
      status:
        highConviction.length > 0
          ? `${highConviction.length} high-conviction trades ready`
          : signals.length > 0
            ? `${signals.length} signals confirmed, building theses`
            : 'Scanning — no confirmations yet today',
    });
  } catch {
    return NextResponse.json({
      signals_today: 0,
      theses_built: 0,
      pipeline_active: false,
      high_conviction: 0,
      status: 'Pipeline unavailable',
    });
  }
}
