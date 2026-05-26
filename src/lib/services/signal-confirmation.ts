import { createAdminClient } from '@/lib/supabase/admin';
import { getRecentCongressionalTrades } from '@/lib/api/smartmoney';
import {
  getRecentInsiderTrades,
  getRecentAnalystChanges,
  getRecentEarningsSurprises,
  getRecentPressReleases,
} from '@/lib/api/fmp';

interface RawSignal {
  ticker: string;
  source: string;
  signal_type: string;
  strength: 'high' | 'medium' | 'low';
  reason: string;
  data?: Record<string, unknown>;
}

export interface ConfirmedSignal {
  ticker: string;
  sources: string[];
  source_count: number;
  signal_types: string[];
  combined_strength: number;
  best_reason: string;
  confirmation_score: number;
  should_build_thesis: boolean;
}

async function insertConfirmedSignal(
  signal: ConfirmedSignal,
  existingTickers: Set<string>
): Promise<void> {
  if (existingTickers.has(signal.ticker)) return;

  const supabase = createAdminClient();
  const notes = `${signal.source_count} sources confirmed: ${signal.sources.join(', ')}. ${signal.best_reason}`;
  const strength =
    signal.confirmation_score >= 8
      ? 'high'
      : signal.confirmation_score >= 5
        ? 'medium'
        : 'low';

  try {
    const { error } = await supabase.from('signals').insert({
      ticker: signal.ticker,
      signal_type: signal.signal_types[0] || 'multi_source',
      strength,
      status: 'pending',
      source: signal.sources.join(' + '),
      notes,
      summary: notes,
      created_at: new Date().toISOString(),
    });
    if (error) console.error('Signal insert error:', error);
    else existingTickers.add(signal.ticker);
  } catch (e) {
    console.error('Signal insert error:', e);
  }
}

export async function runSignalConfirmation(): Promise<ConfirmedSignal[]> {
  const supabase = createAdminClient();

  try {
    await supabase
      .from('signals')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString());
  } catch (e) {
    console.error('Signal expiry cleanup error:', e);
  }

  try {
    const { data: oldSignals } = await supabase
      .from('signals')
      .select('id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if ((oldSignals || []).length > 50) {
      const toDelete = (oldSignals || [])
        .slice(0, (oldSignals || []).length - 50)
        .map((s: { id: string }) => s.id);
      await supabase.from('signals').delete().in('id', toDelete);
    }
  } catch (e) {
    console.error('Signal cap cleanup error:', e);
  }

  const today = new Date().toISOString().split('T')[0];
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const rawSignals: RawSignal[] = [];

  const { data: scannerResults } = await supabase
    .from('scanner_results')
    .select('ticker, scan_type, signal_strength, claude_thesis, conviction_score')
    .eq('scan_date', today)
    .gte('conviction_score', 6)
    .order('conviction_score', { ascending: false });

  (scannerResults || []).forEach(
    (r: {
      ticker: string;
      scan_type: string;
      claude_thesis: string | null;
      conviction_score: number;
    }) => {
      rawSignals.push({
        ticker: r.ticker,
        source: `Market Scanner (${r.scan_type})`,
        signal_type: r.scan_type,
        strength:
          r.conviction_score >= 8 ? 'high' : r.conviction_score >= 6 ? 'medium' : 'low',
        reason: r.claude_thesis || '',
      });
    }
  );

  const { data: intelSignals } = await supabase
    .from('intelligence_signals')
    .select('ticker, source, signal_type, strength, headline')
    .not('ticker', 'is', null)
    .in('strength', ['high', 'medium'])
    .gte('swept_at', twoHoursAgo);

  (intelSignals || []).forEach(
    (s: {
      ticker: string | null;
      source: string;
      signal_type: string;
      strength: 'high' | 'medium' | 'low';
      headline: string;
    }) => {
      if (!s.ticker) return;
      rawSignals.push({
        ticker: s.ticker,
        source: `Intelligence (${s.source})`,
        signal_type: s.signal_type || 'intel',
        strength: s.strength,
        reason: s.headline || '',
      });
    }
  );

  const { data: congressCache } = await supabase
    .from('smartmoney_cache')
    .select('data')
    .eq('cache_key', 'congress_trades')
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let congressTradesList: Array<{
    ticker: string;
    type: string;
    representative: string;
    amount: string;
    transaction_date: string;
  }> = [];

  if (congressCache?.data && Array.isArray(congressCache.data)) {
    congressTradesList = congressCache.data;
  } else {
    congressTradesList = await getRecentCongressionalTrades(7, 20);
  }

  congressTradesList.slice(0, 20).forEach((t) => {
    if (!t.ticker || t.type !== 'Purchase') return;
    rawSignals.push({
      ticker: t.ticker,
      source: `Smart Money (${t.representative})`,
      signal_type: 'congressional_buy',
      strength: 'high',
      reason: `${t.representative} purchased ${t.ticker} (${t.amount}) on ${t.transaction_date}`,
      data: t as unknown as Record<string, unknown>,
    });
  });

  const { data: autopilot } = await supabase
    .from('autopilot_reports')
    .select('top_opportunities, action_items, overall_action')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (autopilot?.top_opportunities) {
    const opps = Array.isArray(autopilot.top_opportunities) ? autopilot.top_opportunities : [];
    opps.forEach(
      (opp: {
        ticker?: string;
        thesis?: string;
        action?: string;
        conviction?: string | number;
      }) => {
        if (!opp.ticker) return;
        const convictionNum =
          typeof opp.conviction === 'number'
            ? opp.conviction
            : opp.conviction === 'high'
              ? 8
              : opp.conviction === 'medium'
                ? 6
                : 4;
        rawSignals.push({
          ticker: opp.ticker,
          source: 'Autopilot',
          signal_type: 'autopilot_opportunity',
          strength: convictionNum >= 8 ? 'high' : 'medium',
          reason: opp.thesis || opp.action || '',
          data: opp as Record<string, unknown>,
        });
      }
    );
  }

  const { data: momentumLeaders } = await supabase
    .from('scanner_results')
    .select('ticker, signal_data, claude_thesis, conviction_score')
    .eq('scan_type', 'momentum')
    .eq('scan_date', today)
    .gte('conviction_score', 7);

  (momentumLeaders || []).forEach(
    (m: {
      ticker: string;
      claude_thesis: string | null;
      conviction_score: number;
      signal_data: Record<string, unknown>;
    }) => {
      rawSignals.push({
        ticker: m.ticker,
        source: 'Momentum Screener',
        signal_type: 'momentum_leader',
        strength: m.conviction_score >= 8 ? 'high' : 'medium',
        reason: m.claude_thesis || '',
        data: m.signal_data,
      });
    }
  );

  try {
    const insiderTrades = await getRecentInsiderTrades(15);
    insiderTrades.forEach((trade) => {
      if (!trade.ticker) return;
      rawSignals.push({
        ticker: trade.ticker,
        source: `Corporate Insider (${trade.insider_title})`,
        signal_type: 'insider_purchase',
        strength: trade.signal_strength,
        reason: `${trade.insider_name} (${trade.insider_title}) purchased $${(trade.dollar_value / 1000).toFixed(0)}K of ${trade.ticker} on ${trade.transaction_date}`,
        data: trade as unknown as Record<string, unknown>,
      });
    });
  } catch {
    /* skip */
  }

  try {
    const upgrades = await getRecentAnalystChanges(10);
    upgrades
      .filter((r) => r.signal === 'bullish')
      .forEach((upgrade) => {
        rawSignals.push({
          ticker: upgrade.ticker,
          source: `Analyst (${upgrade.analyst_company})`,
          signal_type: 'analyst_upgrade',
          strength: 'medium',
          reason: `${upgrade.analyst_company} ${upgrade.action}: ${upgrade.from_grade} → ${upgrade.to_grade}${upgrade.price_target ? ` (target: $${upgrade.price_target})` : ''}`,
          data: upgrade as unknown as Record<string, unknown>,
        });
      });
  } catch {
    /* skip */
  }

  try {
    const releases = await getRecentPressReleases(20);
    releases
      .filter((pr) => pr.is_material)
      .slice(0, 5)
      .forEach((pr) => {
        rawSignals.push({
          ticker: pr.ticker,
          source: 'Press Release',
          signal_type: 'press_release',
          strength: 'medium',
          reason: pr.title.slice(0, 150),
          data: pr as unknown as Record<string, unknown>,
        });
      });
  } catch {
    /* skip */
  }

  try {
    const surprises = await getRecentEarningsSurprises(20);
    surprises
      .filter((s) => s.direction === 'beat' && s.surprise_pct >= 10)
      .forEach((surprise) => {
        rawSignals.push({
          ticker: surprise.ticker,
          source: 'Earnings Beat (FMP)',
          signal_type: 'earnings_beat',
          strength: surprise.surprise_pct >= 20 ? 'high' : 'medium',
          reason: `Earnings beat by ${surprise.surprise_pct.toFixed(1)}% — EPS: $${surprise.actual_eps} vs est $${surprise.estimated_eps}`,
          data: surprise as unknown as Record<string, unknown>,
        });
      });
  } catch {
    /* skip */
  }

  const tickerMap: Record<string, RawSignal[]> = {};
  rawSignals.forEach((signal) => {
    if (!signal.ticker || signal.ticker.length > 5) return;
    if (!tickerMap[signal.ticker]) tickerMap[signal.ticker] = [];
    tickerMap[signal.ticker].push(signal);
  });

  const confirmed: ConfirmedSignal[] = [];

  for (const [ticker, signals] of Object.entries(tickerMap)) {
    const uniqueSources = [...new Set(signals.map((s) => s.source.split('(')[0].trim()))];
    const highStrength = signals.filter((s) => s.strength === 'high');
    const sourceCount = uniqueSources.length;

    const hasCongressional = signals.some((s) => s.signal_type === 'congressional_buy');
    const hasAutopilot = signals.some((s) => s.source === 'Autopilot');
    const hasScanner = signals.some((s) => s.source.includes('Market Scanner'));
    const hasMomentum = signals.some((s) => s.source === 'Momentum Screener');

    const shouldConfirm =
      sourceCount >= 2 ||
      hasCongressional ||
      (hasAutopilot && hasScanner) ||
      (hasMomentum && hasScanner) ||
      highStrength.length >= 2;

    if (!shouldConfirm) continue;

    let score = sourceCount * 2;
    if (hasCongressional) score += 3;
    if (hasAutopilot) score += 2;
    if (hasMomentum) score += 1;
    score += highStrength.length;
    const confirmationScore = Math.min(10, score);

    const bestSignal = [...signals].sort(
      (a, b) =>
        (b.strength === 'high' ? 2 : b.strength === 'medium' ? 1 : 0) -
        (a.strength === 'high' ? 2 : a.strength === 'medium' ? 1 : 0)
    )[0];

    confirmed.push({
      ticker,
      sources: uniqueSources,
      source_count: sourceCount,
      signal_types: [...new Set(signals.map((s) => s.signal_type))],
      combined_strength: signals.reduce(
        (sum, s) => sum + (s.strength === 'high' ? 3 : s.strength === 'medium' ? 2 : 1),
        0
      ),
      best_reason: bestSignal.reason,
      confirmation_score: confirmationScore,
      should_build_thesis: confirmationScore >= 6,
    });
  }

  confirmed.sort((a, b) => b.confirmation_score - a.confirmation_score);

  const { data: existingSignals } = await supabase
    .from('signals')
    .select('ticker')
    .eq('status', 'pending')
    .gte('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString());

  const existingTickers = new Set(
    (existingSignals || []).map((s: { ticker: string }) => s.ticker)
  );

  for (const signal of confirmed.slice(0, 10)) {
    await insertConfirmedSignal(signal, existingTickers);
  }

  return confirmed;
}
