import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

interface SignalOutcome {
  signal_type: string | null;
  action_taken: string | null;
  result: string | null;
  outcome_5d: number | null;
}

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('signal_outcomes')
      .select('*')
      .order('signal_date', { ascending: false })
      .limit(100);

    const outcomes = (data || []) as SignalOutcome[];

    const executed = outcomes.filter((o) => o.action_taken === 'executed');
    const wins = executed.filter((o) => o.result === 'win');
    const losses = executed.filter((o) => o.result === 'loss');

    const winRate =
      executed.length > 0 ? Math.round((wins.length / executed.length) * 100) : 0;
    const avgGain =
      wins.length > 0
        ? wins.reduce((sum, w) => sum + (w.outcome_5d || 0), 0) / wins.length
        : 0;
    const avgLoss =
      losses.length > 0
        ? losses.reduce((sum, l) => sum + (l.outcome_5d || 0), 0) / losses.length
        : 0;

    const byType: Record<
      string,
      { wins: number; losses: number; total: number; avg_return: number }
    > = {};
    executed.forEach((o) => {
      const type = o.signal_type || 'unknown';
      if (!byType[type]) byType[type] = { wins: 0, losses: 0, total: 0, avg_return: 0 };
      byType[type].total++;
      if (o.result === 'win') byType[type].wins++;
      if (o.result === 'loss') byType[type].losses++;
      byType[type].avg_return += o.outcome_5d || 0;
    });

    Object.keys(byType).forEach((type) => {
      byType[type].avg_return =
        byType[type].total > 0 ? byType[type].avg_return / byType[type].total : 0;
    });

    return NextResponse.json({
      outcomes: data || [],
      stats: {
        total: outcomes.length,
        win_rate: winRate,
        avg_gain: avgGain,
        avg_loss: avgLoss,
      },
      by_type: byType,
    });
  } catch {
    return NextResponse.json({ outcomes: [], stats: {}, by_type: {} });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('signal_outcomes')
      .insert({
        ticker: body.ticker?.toUpperCase(),
        signal_type: body.signal_type,
        signal_strength: body.signal_strength,
        signal_date: body.signal_date || new Date().toISOString(),
        action_taken: body.action_taken,
        entry_price: body.entry_price || null,
        price_at_signal: body.price_at_signal || null,
        result: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save outcome';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
