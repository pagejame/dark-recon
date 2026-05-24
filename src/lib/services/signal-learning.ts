import { createAdminClient } from '@/lib/supabase/admin';

export interface SignalWeights {
  [signal_type: string]: {
    win_rate: number;
    avg_return: number;
    sample_size: number;
    weight: number;
    confidence: 'high' | 'medium' | 'low';
  };
}

export interface LearningInsights {
  weights: SignalWeights;
  best_signal: string;
  worst_signal: string;
  overall_win_rate: number;
  total_signals_tracked: number;
  recommendation: string;
  updated_at: string;
}

interface OutcomeRow {
  signal_type: string | null;
  result: string | null;
  outcome_5d: number | null;
}

export async function calculateSignalWeights(): Promise<LearningInsights> {
  const supabase = createAdminClient();

  const { data: outcomes } = await supabase
    .from('signal_outcomes')
    .select('*')
    .not('result', 'eq', 'pending')
    .not('outcome_5d', 'is', null)
    .order('signal_date', { ascending: false })
    .limit(200);

  if (!outcomes || outcomes.length < 5) {
    return {
      weights: {},
      best_signal: 'insufficient_data',
      worst_signal: 'insufficient_data',
      overall_win_rate: 0,
      total_signals_tracked: outcomes?.length || 0,
      recommendation:
        'Need at least 5 signal outcomes to calculate weights. Keep trading and the system will learn.',
      updated_at: new Date().toISOString(),
    };
  }

  const byType: Record<
    string,
    { wins: number; losses: number; returns: number[]; count: number }
  > = {};

  (outcomes as OutcomeRow[]).forEach((o) => {
    const type = o.signal_type || 'unknown';
    if (!byType[type]) byType[type] = { wins: 0, losses: 0, returns: [], count: 0 };
    byType[type].count++;
    if (o.result === 'win') byType[type].wins++;
    if (o.result === 'loss') byType[type].losses++;
    if (o.outcome_5d !== null) byType[type].returns.push(o.outcome_5d);
  });

  const weights: SignalWeights = {};
  let bestSignal = '';
  let bestWinRate = 0;
  let worstSignal = '';
  let worstWinRate = 100;

  Object.entries(byType).forEach(([type, data]) => {
    const winRate = data.count > 0 ? (data.wins / data.count) * 100 : 0;
    const avgReturn =
      data.returns.length > 0
        ? data.returns.reduce((a, b) => a + b, 0) / data.returns.length
        : 0;

    const confidence =
      data.count >= 20 ? 'high' : data.count >= 10 ? 'medium' : 'low';

    const weight = Math.max(0.3, Math.min(2.0, 0.3 + (winRate / 100) * 1.7));

    weights[type] = {
      win_rate: winRate,
      avg_return: avgReturn,
      sample_size: data.count,
      weight,
      confidence,
    };

    if (data.count >= 3) {
      if (winRate > bestWinRate) {
        bestWinRate = winRate;
        bestSignal = type;
      }
      if (winRate < worstWinRate) {
        worstWinRate = winRate;
        worstSignal = type;
      }
    }
  });

  const totalWins = (outcomes as OutcomeRow[]).filter((o) => o.result === 'win').length;
  const overallWinRate = (totalWins / outcomes.length) * 100;

  const recommendation = bestSignal
    ? `Prioritize ${bestSignal.replace(/_/g, ' ')} signals (${bestWinRate.toFixed(0)}% win rate). Reduce weight on ${worstSignal?.replace(/_/g, ' ')} signals (${worstWinRate.toFixed(0)}% win rate).`
    : 'Building signal history — check back after more trades.';

  const insights: LearningInsights = {
    weights,
    best_signal: bestSignal || 'none',
    worst_signal: worstSignal || 'none',
    overall_win_rate: overallWinRate,
    total_signals_tracked: outcomes.length,
    recommendation,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('settings').upsert(
    {
      key: 'signal_weights',
      value: insights,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );
  if (error) console.error('Signal weights save error:', error);

  return insights;
}

export async function getSignalWeights(): Promise<SignalWeights> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'signal_weights')
      .maybeSingle();

    const value = data?.value as LearningInsights | undefined;
    return value?.weights || {};
  } catch {
    return {};
  }
}
