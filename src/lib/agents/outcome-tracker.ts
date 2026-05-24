import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getAlpacaPrice(ticker: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://data.alpaca.markets/v2/stocks/${ticker}/quotes/latest`,
      {
        headers: {
          'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
          'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET || '',
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.quote?.ap || data?.quote?.bp || null;
  } catch {
    return null;
  }
}

export interface OutcomeResult {
  signals_checked: number;
  outcomes_updated: number;
  new_outcomes_created: number;
  wins: number;
  losses: number;
  neutral: number;
}

interface SignalRow {
  id: string;
  ticker: string;
  signal_type: string;
  strength: string;
  status: string;
  created_at: string;
}

interface OutcomeRow {
  id: string;
  price_at_signal: number | null;
  price_at_1d: number | null;
  price_at_5d: number | null;
  price_at_10d: number | null;
  outcome_1d: number | null;
  outcome_5d: number | null;
  outcome_10d: number | null;
  result: string | null;
}

export async function runOutcomeTracker(): Promise<OutcomeResult> {
  const supabase = createAdminClient();
  const result: OutcomeResult = {
    signals_checked: 0,
    outcomes_updated: 0,
    new_outcomes_created: 0,
    wins: 0,
    losses: 0,
    neutral: 0,
  };

  const twelveDaysAgo = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString();
  const { data: signals } = await supabase
    .from('signals')
    .select('*')
    .gte('created_at', twelveDaysAgo)
    .not('ticker', 'is', null)
    .order('created_at', { ascending: false });

  if (!signals || signals.length === 0) return result;

  result.signals_checked = signals.length;

  const uniqueTickers = [...new Set((signals as SignalRow[]).map((s) => s.ticker).filter(Boolean))];

  const prices: Record<string, number | null> = {};
  await Promise.all(
    uniqueTickers.map(async (ticker) => {
      prices[ticker] = await getAlpacaPrice(ticker);
    })
  );

  for (const signal of signals as SignalRow[]) {
    if (!signal.ticker || !prices[signal.ticker]) continue;

    const currentPrice = prices[signal.ticker]!;
    const signalDate = new Date(signal.created_at);
    const now = new Date();
    const daysSinceSignal = Math.floor(
      (now.getTime() - signalDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const { data: existingOutcome } = await supabase
      .from('signal_outcomes')
      .select('*')
      .eq('ticker', signal.ticker)
      .eq('signal_date', signal.created_at)
      .maybeSingle();

    if (existingOutcome) {
      const existing = existingOutcome as OutcomeRow;
      const updates: Record<string, unknown> = {
        last_checked_at: now.toISOString(),
        auto_tracked: true,
      };

      if (daysSinceSignal >= 1 && !existing.price_at_1d && currentPrice) {
        updates.price_at_1d = currentPrice;
        updates.outcome_1d = existing.price_at_signal
          ? ((currentPrice - existing.price_at_signal) / existing.price_at_signal) * 100
          : null;
      }
      if (daysSinceSignal >= 5 && !existing.price_at_5d && currentPrice) {
        updates.price_at_5d = currentPrice;
        updates.outcome_5d = existing.price_at_signal
          ? ((currentPrice - existing.price_at_signal) / existing.price_at_signal) * 100
          : null;
      }
      if (daysSinceSignal >= 10 && !existing.price_at_10d && currentPrice) {
        updates.price_at_10d = currentPrice;
        updates.outcome_10d = existing.price_at_signal
          ? ((currentPrice - existing.price_at_signal) / existing.price_at_signal) * 100
          : null;
      }

      if (updates.outcome_5d !== undefined || existing.outcome_5d !== null) {
        const outcome5d = (updates.outcome_5d as number | undefined) ?? existing.outcome_5d;
        if (outcome5d != null) {
          if (outcome5d > 2) {
            updates.result = 'win';
            result.wins++;
          } else if (outcome5d < -2) {
            updates.result = 'loss';
            result.losses++;
          } else {
            updates.result = 'neutral';
            result.neutral++;
          }
        }
      }

      await supabase.from('signal_outcomes').update(updates).eq('id', existing.id);
      result.outcomes_updated++;
    } else {
      await supabase.from('signal_outcomes').insert({
        ticker: signal.ticker,
        signal_type: signal.signal_type,
        signal_strength: signal.strength,
        signal_date: signal.created_at,
        action_taken:
          signal.status === 'executed'
            ? 'executed'
            : signal.status === 'confirmed'
              ? 'confirmed'
              : signal.status === 'passed'
                ? 'passed'
                : 'ignored',
        price_at_signal: currentPrice,
        result: 'pending',
        auto_tracked: true,
        last_checked_at: now.toISOString(),
      });
      result.new_outcomes_created++;
    }
  }

  try {
    const { data: recentOutcomes } = await supabase
      .from('signal_outcomes')
      .select('*')
      .not('outcome_5d', 'is', null)
      .order('signal_date', { ascending: false })
      .limit(20);

    if (recentOutcomes && recentOutcomes.length >= 5) {
      const outcomeContext = recentOutcomes
        .map(
          (o: { ticker: string; signal_type: string; outcome_5d: number; result: string }) =>
            `${o.ticker} (${o.signal_type}): ${o.outcome_5d?.toFixed(2)}% 5d return — ${o.result}`
        )
        .join('\n');

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: `Analyze these signal outcomes and identify which signal types are performing best. Return JSON only:

RECENT SIGNAL OUTCOMES:
${outcomeContext}

{
  "best_signal_type": "momentum_breakout",
  "worst_signal_type": "reversal_candidate",
  "avg_win_return": 4.2,
  "avg_loss_return": -3.1,
  "win_rate": 65,
  "insight": "One sentence actionable insight about which signals to prioritize",
  "recommendation": "One sentence recommendation to improve signal quality"
}`,
          },
        ],
      });

      const raw = message.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('');
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');

      if (start !== -1 && end !== -1) {
        const insights = JSON.parse(raw.slice(start, end + 1));
        await supabase.from('settings').upsert(
          {
            key: 'signal_insights',
            value: { ...insights, updated_at: new Date().toISOString() },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' }
        );
      }
    }
  } catch (e) {
    console.error('Insights generation error (non-fatal):', e);
  }

  return result;
}
