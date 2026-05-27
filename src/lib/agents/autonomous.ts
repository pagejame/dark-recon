import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPositions, getAccount, getOrders } from '@/lib/api/alpaca';
import { logAuditEvent } from '@/lib/services/audit';
import { getAutonomyConfig, executeQueueTradeByTicker, executeAutonomousTrade } from '@/lib/services/autonomy';
import { runIntelligenceSweep } from '@/lib/agents/intelligence';
import { getRecentCongressionalTrades } from '@/lib/api/smartmoney';
import { getUnusualOptionsFlow } from '@/lib/api/options-flow';
import { calculateSignalWeights } from '@/lib/services/signal-learning';
import { runSignalConfirmation } from '@/lib/services/signal-confirmation';
import { buildThesesForConfirmedSignals, type AutoThesis } from '@/lib/services/auto-thesis';
import type { ConfirmedSignal } from '@/lib/services/signal-confirmation';
import { checkCircuitBreaker } from '@/lib/services/circuit-breaker';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface AgentDecision {
  action: 'AUTO_EXECUTE' | 'QUEUE_FOR_APPROVAL' | 'NOTIFY' | 'SKIP';
  issue: string;
  rationale: string;
  endpoint?: string;
  method?: string;
  body?: Record<string, unknown> | null;
  priority: 'critical' | 'high' | 'medium' | 'low';
  ticker?: string;
}

export interface AgentRunResult {
  ran_at: string;
  decisions: AgentDecision[];
  executed: number;
  queued: number;
  notified: number;
  skipped: number;
  errors: string[];
  duration_ms: number;
}

function getBaseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

const TIER2_API_TIMEOUT_MS = 3000;
const MAX_TIER2_OPS = 6;

function withTier2Timeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout`)), TIER2_API_TIMEOUT_MS)
    ),
  ]);
}

async function getTierLevel(
  supabase: SupabaseAdmin
): Promise<{ tier: number; run_count: number }> {
  try {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'agent_run_count')
      .maybeSingle();

    const count = ((data?.value as { count?: number })?.count || 0) + 1;

    await supabase.from('settings').upsert(
      {
        key: 'agent_run_count',
        value: { count, last_run: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

    const tier = count % 6 === 0 ? 3 : count % 3 === 0 ? 2 : 1;
    return { tier, run_count: count };
  } catch {
    return { tier: 1, run_count: 1 };
  }
}

async function gatherStatus(
  supabase: SupabaseAdmin
): Promise<{ status: string; tier: number; fresh_data: Record<string, unknown> }> {
  const { tier, run_count } = await getTierLevel(supabase);
  const tier1Sections: string[] = [];
  const tier2Sections: string[] = [];
  const freshData: Record<string, unknown> = { tier, run_count };

  // TIER 1 — Every run (live data, fast). Sections assembled in priority order at end.
  let portfolioSection: string | null = null;

  try {
    const [positions, account, orders] = await Promise.all([
      getPositions(),
      getAccount(),
      getOrders('open', 20),
    ]);

    const equity = parseFloat((account as { equity?: string })?.equity || '0');
    const lastEquity = parseFloat(
      (account as { last_equity?: string })?.last_equity || equity.toString()
    );
    const dayPnL = equity - lastEquity;
    const dayPnLPct = lastEquity > 0 ? (dayPnL / lastEquity) * 100 : 0;

    freshData.equity = equity;
    freshData.positions = positions;
    freshData.day_pnl = dayPnL;
    freshData.position_count = (positions as unknown[]).length;
    freshData.over_capacity = (positions as unknown[]).length > 5;

    try {
      const todayStart = `${new Date().toISOString().split('T')[0]}T00:00:00Z`;
      const { count } = await supabase
        .from('audit_log')
        .select('*', { count: 'exact', head: true })
        .eq('event_type', 'trade_executed')
        .gte('event_at', todayStart);
      freshData.trades_today = count || 0;
    } catch {
      freshData.trades_today = 0;
    }

    portfolioSection = `LIVE PORTFOLIO (Tier 1 — refreshed now):
Equity: $${equity.toLocaleString()} | Day P&L: ${dayPnL >= 0 ? '+' : ''}$${dayPnL.toFixed(2)} (${dayPnLPct >= 0 ? '+' : ''}${dayPnLPct.toFixed(2)}%)
Open positions: ${(positions as unknown[]).length}
${(positions as { symbol: string; unrealized_plpc?: string; market_value?: string }[])
  .map((p) => {
    const pnl = parseFloat(p.unrealized_plpc || '0') * 100;
    return `  ${p.symbol}: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}% total P&L | $${parseFloat(p.market_value || '0').toFixed(0)} position`;
  })
  .join('\n')}
Pending orders: ${(orders as unknown[]).length}
${(orders as { symbol: string; side: string; qty: string; limit_price?: string }[])
  .map((o) => `  ${o.symbol}: ${o.side} ${o.qty} @ $${o.limit_price || 'market'}`)
  .join('\n')}`;
  } catch {
    portfolioSection = 'LIVE PORTFOLIO: Fetch failed';
  }

  const prioritySections: string[] = [];
  const alertSections: string[] = [];

  try {
    const { data: confirmedToday } = await supabase
      .from('signals')
      .select('ticker, signal_type, strength, source, notes')
      .eq('status', 'pending')
      .in('strength', ['high', 'medium'])
      .gte('created_at', new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(5);

    if ((confirmedToday || []).length > 0) {
      prioritySections.push(`CONFIRMED SIGNALS — READY TO TRADE:
${(confirmedToday || [])
  .map(
    (s: { ticker: string; strength: string; source: string; notes?: string }) =>
      `  ${s.ticker} [${s.strength.toUpperCase()}] (${s.source?.split(' ')[0]}): ${(s.notes || '').slice(0, 60)}`
  )
  .join('\n')}`);
      freshData.confirmed_signals = confirmedToday;
    }
  } catch {
    /* skip */
  }

  try {
    const { data: queue } = await supabase
      .from('trade_queue')
      .select('ticker, instrument_type, conviction_score, expires_at, status')
      .in('status', ['pending', 'executed'])
      .order('queued_at', { ascending: false })
      .limit(10);

    const pending = (queue || []).filter((t: { status: string }) => t.status === 'pending');
    const executedToday = (queue || []).filter((t: { status: string; expires_at: string }) => {
      if (t.status !== 'executed') return false;
      return new Date(t.expires_at).toDateString() === new Date().toDateString();
    });

    prioritySections.push(`TRADE QUEUE:
Pending approval: ${pending.length}
${pending
  .map(
    (t: { ticker: string; instrument_type: string; conviction_score: number }) =>
      `  ${t.ticker} ${t.instrument_type} — conviction ${t.conviction_score}/10`
  )
  .join('\n')}
Executed today: ${executedToday.length}`);
  } catch {
    /* skip */
  }

  try {
    const { evaluateExitLogic } = await import('@/lib/services/exit-logic');
    const exitSignals = await evaluateExitLogic();
    const immediateExits = exitSignals.filter((s) => s.urgency === 'immediate');

    if (immediateExits.length > 0) {
      prioritySections.unshift(`EXIT SIGNALS — ACTION REQUIRED:
${immediateExits
  .map(
    (s) =>
      `  ${s.ticker} [${s.exit_type.toUpperCase()}]: ${s.reason} → ${s.action.replace(/_/g, ' ').toUpperCase()}`
  )
  .join('\n')}`);
      freshData.exit_signals = immediateExits;
    }

    const monitorExits = exitSignals.filter((s) => s.urgency === 'monitor');
    if (monitorExits.length > 0) {
      prioritySections.push(`POSITIONS TO MONITOR (consider exiting):
${monitorExits.map((s) => `  ${s.ticker}: ${s.reason}`).join('\n')}`);
      freshData.monitor_exit_signals = monitorExits;
    }
  } catch {
    /* skip */
  }

  if (portfolioSection) {
    tier1Sections.push(...prioritySections, portfolioSection);
  } else {
    tier1Sections.push(...prioritySections);
  }

  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: recentSignals } = await supabase
      .from('signals')
      .select('ticker, signal_type, strength, status, created_at')
      .gte('created_at', twoHoursAgo)
      .order('created_at', { ascending: false })
      .limit(10);

    const highConviction = (recentSignals || []).filter(
      (s: { strength: string }) => s.strength === 'high'
    );

    if (highConviction.length > 0) {
      alertSections.push(`RECENT HIGH CONVICTION SIGNALS (last 2h):
${highConviction
  .map(
    (s: { ticker: string; signal_type: string; status: string }) =>
      `  ${s.ticker}: ${s.signal_type} (${s.status})`
  )
  .join('\n')}`);
      freshData.recent_signals = highConviction;
    }
  } catch {
    /* skip */
  }

  try {
    const { data: intradaySignals } = await supabase
      .from('signals')
      .select('ticker, signal_type, strength, notes')
      .in('signal_type', [
        'gap_and_go',
        'vwap_reclaim',
        'orb_breakout',
        'momentum_continuation',
        'reversal_short',
        'high_of_day_break',
      ])
      .eq('status', 'pending')
      .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if ((intradaySignals || []).length > 0) {
      alertSections.push(`LIVE INTRADAY SETUPS (last 5 min):
${(intradaySignals || [])
  .map(
    (s: { ticker: string; signal_type: string; notes?: string }) =>
      `  ${s.ticker} [${s.signal_type.replace(/_/g, ' ').toUpperCase()}]: ${s.notes || ''}`
  )
  .join('\n')}`);
      freshData.intraday_signals = intradaySignals;
    }
  } catch {
    /* skip */
  }

  try {
    const [priceAlerts, posAlerts] = await Promise.all([
      supabase.from('price_alerts').select('*').in('status', ['active', 'triggered']),
      supabase
        .from('position_alerts')
        .select('*')
        .eq('status', 'active')
        .order('fired_at', { ascending: false })
        .limit(5),
    ]);

    const triggered = (priceAlerts.data || []).filter(
      (a: { status: string }) => a.status === 'triggered'
    );
    if (triggered.length > 0) {
      alertSections.push(`TRIGGERED PRICE ALERTS (action needed):
${triggered
  .map(
    (a: { ticker: string; condition: string; target_price: number }) =>
      `  ${a.ticker} ${a.condition} $${a.target_price} — TRIGGERED`
  )
  .join('\n')}`);
    }

    const criticalAlerts = (posAlerts.data || []).filter(
      (a: { severity: string }) => a.severity === 'critical'
    );
    if (criticalAlerts.length > 0) {
      alertSections.push(`CRITICAL POSITION ALERTS:
${criticalAlerts
  .map((a: { ticker: string; message: string }) => `  ${a.ticker}: ${a.message}`)
  .join('\n')}`);
    }
  } catch {
    /* skip */
  }

  try {
    const { data: stopAlerts } = await supabase
      .from('price_alerts')
      .select('ticker')
      .eq('status', 'active')
      .eq('condition', 'below');

    const protectedTickers = new Set(
      (stopAlerts || []).map((a: { ticker: string }) => a.ticker)
    );
    const allPositions =
      (freshData.positions as { symbol: string }[] | undefined) || [];
    const unprotected = allPositions
      .filter((p) => !protectedTickers.has(p.symbol))
      .map((p) => p.symbol);

    if (unprotected.length > 0) {
      alertSections.push(`UNPROTECTED POSITIONS (no stop loss):
${unprotected.join(', ')} — stops must be created immediately`);
      freshData.unprotected = unprotected;
    }
  } catch {
    /* skip */
  }

  tier1Sections.push(...alertSections);

  // TIER 2 — Every 30 minutes (full intelligence pipeline, max 6 ops)
  if (tier >= 2) {
    tier2Sections.push(`--- TIER 2: FULL INTELLIGENCE PIPELINE ---`);
    let tier2OpsRun = 0;

    const runTier2 = async (label: string, fn: () => Promise<void>): Promise<void> => {
      if (tier2OpsRun >= MAX_TIER2_OPS) return;
      tier2OpsRun++;
      try {
        await fn();
      } catch (e) {
        console.error(`${label} failed (non-fatal):`, e instanceof Error ? e.message : e);
        tier2Sections.push(`${label.toUpperCase()}: Unavailable this cycle`);
      }
    };

    await runTier2('Intelligence sweep', async () => {
      const sweepResult = await withTier2Timeout(runIntelligenceSweep(), 'Intelligence sweep');
      const highStrength = sweepResult.filter((s) => s.strength === 'high');
      tier2Sections.push(
        `INTELLIGENCE SWEEP: ${sweepResult.length} signals, ${highStrength.length} high strength`
      );
      freshData.intelligence_signals = highStrength;
    });

    await runTier2('News feed intelligence', async () => {
      const { scanNewsFeeds, saveNewsSignals } = await import('@/lib/api/news-feeds');
      const newsSignals = await Promise.race([
        scanNewsFeeds(),
        new Promise<Awaited<ReturnType<typeof scanNewsFeeds>>>((resolve) =>
          setTimeout(() => resolve([]), 10000)
        ),
      ]).catch(() => []);

      if (newsSignals.length > 0) {
        await saveNewsSignals(newsSignals);
        tier2Sections.push(
          `NEWS FEED INTELLIGENCE (NASDAQ/Benzinga/Yahoo):
${newsSignals
  .slice(0, 4)
  .map((s) => `  [${s.source}] ${s.tickers.join(',')} — ${s.summary.slice(0, 60)}`)
  .join('\n')}`
        );
        freshData.news_signals = newsSignals;
      }
    });

    await runTier2('Signal confirmation', async () => {
      const confirmedSignals = await withTier2Timeout(
        runSignalConfirmation(),
        'Signal confirmation'
      );
      freshData.confirmed_signals = confirmedSignals;

      if (confirmedSignals.length > 0) {
        tier2Sections.push(
          `CONFIRMED: ${confirmedSignals
            .slice(0, 5)
            .map(
              (s) =>
                `${s.ticker}[${s.confirmation_score}/10] ${s.sources.slice(0, 2).join('+')}`
            )
            .join(', ')}`
        );

        try {
          const theses = await withTier2Timeout(
            buildThesesForConfirmedSignals(confirmedSignals.slice(0, 2)),
            'Thesis builder'
          );
          freshData.auto_theses = theses;

          if (theses.length > 0) {
            tier2Sections.push(
              `THESES READY: ${theses
                .slice(0, 4)
                .map((t) => `${t.ticker}[${t.conviction_score}/10]`)
                .join(', ')}`
            );
          }
        } catch (e) {
          console.error(
            'Thesis builder failed (non-fatal):',
            e instanceof Error ? e.message : e
          );
          tier2Sections.push('THESIS BUILDER: Unavailable this cycle');
        }
      } else {
        tier2Sections.push('SIGNAL CONFIRMATION: No multi-source confirmations this cycle');
      }
    });

    await runTier2('Sector rotation', async () => {
      const { getSectorRotation } = await import('@/lib/services/sector-rotation');
      const rotation = await withTier2Timeout(getSectorRotation(), 'Sector rotation');
      if (rotation) {
        tier2Sections.push(
          `SECTORS: ${rotation.market_regime.toUpperCase()} — ${rotation.rotation_signal.slice(0, 120)}`
        );
        freshData.sector_rotation = rotation;
      }
    });

    await runTier2('Congressional trades', async () => {
      const congressTrades = await Promise.race([
        getRecentCongressionalTrades(7, 20),
        new Promise<Awaited<ReturnType<typeof getRecentCongressionalTrades>>>((resolve) =>
          setTimeout(() => resolve([]), TIER2_API_TIMEOUT_MS)
        ),
      ]);
      const recentTrades = congressTrades.slice(0, 3);

      if (recentTrades.length > 0) {
        tier2Sections.push(
          `CONGRESS: ${recentTrades.map((t) => `${t.representative} ${t.type} ${t.ticker}`).join(', ')}`
        );
        freshData.congressional = recentTrades;
      }
    });

    await runTier2('FRED macro', async () => {
      const { getMacroSnapshot } = await import('@/lib/api/fred');
      const macro = await withTier2Timeout(getMacroSnapshot(), 'FRED macro');
      if (macro) {
        tier2Sections.push(macro.market_backdrop.slice(0, 200));
        freshData.macro_regime = macro.macro_regime;
      }
    });

    await runTier2('Fear & Greed', async () => {
      const { getFearGreedIndex } = await import('@/lib/api/market-sentiment');
      const fg = await Promise.race([
        getFearGreedIndex(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      if (fg) {
        tier2Sections.push(
          `SENTIMENT: Fear & Greed ${fg.value}/100 (${fg.label})${fg.is_contrarian_buy ? ' — CONTRARIAN BUY SIGNAL' : fg.is_contrarian_sell ? ' — CONTRARIAN CAUTION' : ''}`
        );
        freshData.fear_greed = fg;
      }
    });

    await runTier2('Economic calendar', async () => {
      const { getUpcomingEconomicEvents } = await import('@/lib/api/market-sentiment');
      const events = await Promise.race([
        getUpcomingEconomicEvents(),
        new Promise<Awaited<ReturnType<typeof getUpcomingEconomicEvents>>>((resolve) =>
          setTimeout(() => resolve([]), 3000)
        ),
      ]);
      const todayHigh = events.filter((e) => e.is_today && e.impact === 'high');
      if (todayHigh.length > 0) {
        tier2Sections.push(
          `ECON CALENDAR: HIGH IMPACT today — ${todayHigh.map((e) => e.event).join(', ')} — tighten stops around release`
        );
        freshData.economic_events = events;
      }
    });

    await runTier2('Earnings calendar', async () => {
      const { data: earnings } = await supabase
        .from('earnings_events')
        .select('symbol, date, hour, eps_estimate')
        .gte('date', new Date().toISOString().split('T')[0])
        .lte(
          'date',
          new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        )
        .order('date', { ascending: true })
        .limit(5);

      if ((earnings || []).length > 0) {
        tier2Sections.push(
          `EARNINGS: ${(earnings || [])
            .map(
              (e: { symbol: string; date: string; hour: string }) =>
                `${e.symbol} ${e.date} ${e.hour === 'bmo' ? 'BMO' : 'AMC'}`
            )
            .join(', ')}`
        );
        freshData.earnings = earnings;
      }
    });

    await runTier2('Insider trades', async () => {
      const { getRecentInsiderTrades } = await import('@/lib/api/fmp');
      const insiders = await Promise.race([
        getRecentInsiderTrades(5),
        new Promise<Awaited<ReturnType<typeof getRecentInsiderTrades>>>((resolve) =>
          setTimeout(() => resolve([]), 3000)
        ),
      ]);
      const big = insiders.filter((t) => t.signal_strength === 'high').slice(0, 3);
      if (big.length > 0) {
        tier2Sections.push(
          `INSIDER BUYING: ${big.map((t) => `${t.ticker} $${(t.dollar_value / 1000).toFixed(0)}K (${t.insider_title})`).join(', ')}`
        );
        freshData.insider_trades = big;
      }
    });

    await runTier2('Squeeze setups', async () => {
      const { scanForSqueezeSetups } = await import('@/lib/api/short-interest');
      const watchlistResult = await supabase.from('watchlist').select('ticker').limit(10);
      const tickers = (watchlistResult.data || []).map((w: { ticker: string }) => w.ticker);
      const squeezes = await Promise.race([
        scanForSqueezeSetups(tickers),
        new Promise<Awaited<ReturnType<typeof scanForSqueezeSetups>>>((resolve) =>
          setTimeout(() => resolve([]), 5000)
        ),
      ]);
      if (squeezes.length > 0) {
        tier2Sections.push(
          `SQUEEZE SETUPS: ${squeezes
            .slice(0, 3)
            .map((s) => `${s.ticker} ${s.short_float_pct.toFixed(0)}% short`)
            .join(', ')}`
        );
        freshData.squeeze_setups = squeezes;
      }
    });

    await runTier2('Signal performance', async () => {
      const weights = await calculateSignalWeights();
      if (weights.total_signals_tracked > 0) {
        tier2Sections.push(
          `SIGNAL PERF: ${weights.overall_win_rate.toFixed(1)}% win rate — best: ${weights.best_signal}`
        );
      }
    });
  }

  // TIER 3 — Every 60 minutes (deep analysis)
  if (tier >= 3) {
    tier2Sections.push(`--- TIER 3 REFRESH (60-min cycle) ---`);

    try {
      const optionsFlow = await getUnusualOptionsFlow();
      const highFlow = optionsFlow.filter((f) => f.signal_strength === 'high');

      if (highFlow.length > 0) {
        tier2Sections.push(
          `OPTIONS FLOW: ${highFlow
            .slice(0, 3)
            .map((f) => `${f.ticker} ${f.type.toUpperCase()} $${f.strike}`)
            .join(', ')}`
        );
        freshData.options_flow = highFlow;
      }
    } catch {
      /* skip */
    }

    try {
      const { runRebalanceCheck } = await import('@/lib/agents/rebalance');
      const rebalanceActions = await runRebalanceCheck();
      const immediate = rebalanceActions.filter((a) => a.urgency === 'immediate');

      if (immediate.length > 0) {
        tier2Sections.push(
          `REBALANCE: ${immediate.map((a) => `${a.ticker} ${a.reason.slice(0, 60)}`).join('; ')}`
        );
        freshData.rebalance = immediate;
      }
    } catch {
      /* skip */
    }

    try {
      const { runCorrelationMonitor } = await import('@/lib/services/correlation');
      const correlationAlerts = await runCorrelationMonitor();

      if (correlationAlerts.length > 0) {
        tier2Sections.push(
          `CORRELATION: ${correlationAlerts.map((a) => a.message.slice(0, 80)).join('; ')}`
        );
      }
    } catch {
      /* skip */
    }

    try {
      const { data: cronRuns } = await supabase
        .from('cron_runs')
        .select('job_name, status, ran_at')
        .order('ran_at', { ascending: false })
        .limit(20);

      const jobMap: Record<string, { job_name: string; status: string; ran_at: string }> = {};
      (cronRuns || []).forEach((r: { job_name: string; status: string; ran_at: string }) => {
        if (!jobMap[r.job_name]) jobMap[r.job_name] = r;
      });

      const failedJobs = Object.values(jobMap).filter((r) => r.status === 'failed');
      const staleJobs = Object.values(jobMap).filter((r) => {
        const hoursAgo = (Date.now() - new Date(r.ran_at).getTime()) / (1000 * 60 * 60);
        return r.job_name === 'morning-run' && hoursAgo > 25;
      });

      if (failedJobs.length > 0 || staleJobs.length > 0) {
        tier2Sections.push(
          `CRON ISSUES: ${failedJobs.map((r) => r.job_name).join(', ')}${staleJobs.length ? ` stale: ${staleJobs.map((r) => r.job_name).join(', ')}` : ''}`
        );
      } else {
        tier2Sections.push('CRON HEALTH: All jobs running normally');
      }
    } catch {
      /* skip */
    }
  }

  const tier1Status = tier1Sections.join('\n\n');
  let tier1Capped: string;
  if (tier1Status.length > 3000) {
    const cutPoint = tier1Status.lastIndexOf('\n\n', 3000);
    const safePoint = cutPoint > 1000 ? cutPoint : 3000;
    tier1Capped = `${tier1Status.slice(0, safePoint)}\n\n[ADDITIONAL DATA TRUNCATED]`;
  } else {
    tier1Capped = tier1Status;
  }

  const tier2Status = tier2Sections.join('\n');
  const tier2Capped =
    tier2Status.length > 1500
      ? `${tier2Status.slice(0, 1500)}\n[TIER 2 TRUNCATED]`
      : tier2Status;

  const status =
    tier2Sections.length > 0
      ? `${tier1Capped}\n\n--- INTELLIGENCE SUMMARY ---\n${tier2Capped}`
      : tier1Capped;

  return {
    status,
    tier,
    fresh_data: freshData,
  };
}

export async function runAutonomousAgent(): Promise<AgentRunResult> {
  const startTime = Date.now();
  const supabase = createAdminClient();

  const { data: settings } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'autonomous_agent_enabled')
    .maybeSingle();

  if (settings?.value?.enabled === false) {
    return {
      ran_at: new Date().toISOString(),
      decisions: [],
      executed: 0,
      queued: 0,
      notified: 0,
      skipped: 1,
      errors: [],
      duration_ms: Date.now() - startTime,
    };
  }

  const autonomy = await getAutonomyConfig();
  const circuitBreaker = await checkCircuitBreaker().catch(() => null);

  if (circuitBreaker?.should_stop_trading) {
    return {
      ran_at: new Date().toISOString(),
      decisions: [
        {
          action: 'SKIP',
          issue: circuitBreaker.reason,
          rationale: `Circuit breaker active — ${circuitBreaker.reason}`,
          priority: 'critical',
        },
      ],
      executed: 0,
      queued: 0,
      notified: 0,
      skipped: 1,
      errors: [],
      duration_ms: Date.now() - startTime,
    };
  }

  const effectiveMinConviction = circuitBreaker
    ? Math.ceil(autonomy.min_conviction / (circuitBreaker.conviction_modifier || 1))
    : autonomy.min_conviction;

  const { data: recentActions } = await supabase
    .from('audit_log')
    .select('action_taken, event_at')
    .eq('source', 'system')
    .gte('event_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .order('event_at', { ascending: false })
    .limit(10);

  const recentActionSummary =
    (recentActions || []).map((a: { action_taken: string }) => a.action_taken).join('\n') ||
    'None in last 30 minutes';

  const { status: rawStatus, tier, fresh_data } = await gatherStatus(supabase).catch((e) => {
    console.error('gatherStatus failed:', e instanceof Error ? e.message : e);
    return {
      status: 'Status gathering failed — use DB data only',
      tier: 1,
      fresh_data: {} as Record<string, unknown>,
    };
  });

  if (tier >= 2) {
    await new Promise((r) => setTimeout(r, 500));
  }

  const openPositions = ((fresh_data.positions as unknown[]) || []).length;
  const positionCount = (fresh_data.position_count as number) ?? openPositions;
  const overCapacity = (fresh_data.over_capacity as boolean) ?? positionCount > 5;

  const riskControlsSection = circuitBreaker
    ? `RISK CONTROLS:
Daily P&L: ${circuitBreaker.daily_pnl_pct >= 0 ? '+' : ''}${circuitBreaker.daily_pnl_pct.toFixed(2)}% ($${circuitBreaker.daily_pnl_dollar.toFixed(0)})
VIX: ${circuitBreaker.vix_level.toFixed(1)} — Market: ${circuitBreaker.market_condition.toUpperCase()}
Trades today: ${circuitBreaker.trade_count_today}/100
Positions: ${positionCount}/5${overCapacity ? ' ⚠️ OVER CAPACITY — close weakest before opening new trades' : ''}
${circuitBreaker.market_condition !== 'normal' ? `⚠️ ELEVATED VOLATILITY: Min conviction raised to ${effectiveMinConviction}/10` : 'Risk controls: Normal'}
Circuit breaker: ${circuitBreaker.triggered ? `TRIGGERED — ${circuitBreaker.reason}` : 'OFF'}`
    : `RISK CONTROLS:
Positions: ${positionCount}/5${overCapacity ? ' ⚠️ OVER CAPACITY — close weakest before opening new trades' : ''}`;

  const status = riskControlsSection ? `${riskControlsSection}\n\n${rawStatus}` : rawStatus;
  fresh_data.circuit_breaker = circuitBreaker;
  fresh_data.effective_min_conviction = effectiveMinConviction;

  if (!status || status.length < 50) {
    console.error('Status too short to be useful, skipping agent call');
    return {
      ran_at: new Date().toISOString(),
      decisions: [
        {
          action: 'SKIP',
          issue: 'Insufficient status data',
          rationale: 'Status gathering returned insufficient data',
          priority: 'low',
        },
      ],
      executed: 0,
      queued: 0,
      notified: 0,
      skipped: 1,
      errors: ['Status too short'],
      duration_ms: Date.now() - startTime,
    };
  }

  const autonomyInstruction = autonomy.enabled
    ? `FULL AUTONOMY MODE ACTIVE${autonomy.days_remaining != null ? ` (${autonomy.days_remaining} days remaining in 30-day trial)` : ''}.
Execute everything that meets strategy rules. No approval needed.
Min conviction to trade: ${effectiveMinConviction}/10 | Max position: ${autonomy.max_position_pct}% | Daily trade limit: ${autonomy.daily_trade_limit}`
    : `APPROVAL MODE: Queue trades for human approval. Auto-execute only maintenance actions.`;

  const tierNote = `INTELLIGENCE REFRESH TIER: ${tier} (${tier === 1 ? 'live data only' : tier === 2 ? 'full sweep ran' : 'deep analysis ran'})`;

  const sectorInstruction =
    autonomy.trading_mode === 'day_trading'
      ? ''
      : `
When making trade decisions, prioritize stocks in LEADING sectors and avoid stocks in LAGGING sectors.
If market regime is RISK_OFF, favor defensive positions and tighter stops.
If market regime is RISK_ON, favor growth/momentum names with higher conviction.`;

  const macroInstruction =
    autonomy.trading_mode === 'day_trading'
      ? ''
      : fresh_data.macro_regime
        ? `\nMACRO REGIME: ${String(fresh_data.macro_regime).toUpperCase()} — adjust all trade sizing and conviction accordingly.`
        : '';

  const autoTheses = fresh_data.auto_theses as AutoThesis[] | undefined;
  const confirmedSignals = fresh_data.confirmed_signals as
    | ConfirmedSignal[]
    | Array<{
        ticker: string;
        strength?: string;
        source?: string;
        notes?: string;
        confirmation_score?: number;
        best_reason?: string;
      }>
    | undefined;

  const tradesToday = (fresh_data.trades_today as number) || 0;
  const equity = (fresh_data.equity as number) || 100000;
  const tradesRemaining = autonomy.daily_trade_limit - tradesToday;

  const confirmedSignalsList =
    confirmedSignals && confirmedSignals.length > 0
      ? confirmedSignals
          .map((s) => {
            const signal = s as {
              ticker: string;
              strength?: string;
              source?: string;
              notes?: string;
              confirmation_score?: number;
              best_reason?: string;
            };
            const score =
              signal.confirmation_score ??
              (signal.strength === 'high' ? 9 : signal.strength === 'medium' ? 7 : 5);
            const reason = String(
              signal.best_reason || signal.notes || signal.source || ''
            ).slice(0, 50);
            return `  ${signal.ticker} [${score}/10]: ${reason}`;
          })
          .join('\n')
      : 'Check intelligence summary for confirmed signals';

  const pipelineInstruction =
    autoTheses && autoTheses.length > 0
      ? `\nPIPELINE READY: ${autoTheses.length} trade theses built and confirmed by multiple sources. These have passed the full intelligence pipeline (Scanner → Signal Confirmation → Thesis Builder). In full autonomy mode, execute any with conviction ≥ ${effectiveMinConviction} that fit portfolio rules.`
      : confirmedSignals && confirmedSignals.length > 0
        ? `\nCONFIRMED SIGNALS: ${confirmedSignals.length} tickers confirmed and READY TO EXECUTE. Return AUTO_EXECUTE buy decisions — do not SKIP.`
        : '';

  const dayTradingInstruction =
    autonomy.trading_mode === 'day_trading'
      ? `
DAY TRADING MODE — Decisions must be fast and decisive:
- Open AND close positions same day
- Profit targets: +2% partial, +5% full, +10% runner
- Stop: -1.5% hard cut, no exceptions
- Short on weakness (setup_type: reversal_short)
- Conviction ≥ 7 = execute in full autonomy
- Max 10 concurrent positions, 3% each
- Prioritize: HOD breaks, ORB, VWAP reclaim, gap continuation
`
      : '';

  const swingTradingInstruction =
    autonomy.trading_mode === 'swing_trading'
      ? `
SWING / INVESTING MODE — Full Autonomy Active:
- You have ${autonomy.daily_trade_limit} trades/day limit. Used: ${tradesToday}. Remaining: ${tradesRemaining}
- Open positions: ${positionCount}/5. Max 5 concurrent at 8% each = $${Math.round(equity * 0.08).toLocaleString()} per trade
- Profit targets: +10% partial, +20% full, +30% runner. Stop: -7%

CAPACITY RULE — CRITICAL:
Max 5 concurrent positions. Currently at ${positionCount}/5.
If over capacity: AUTO_EXECUTE close weakest position using GET /api/alpaca/positions/{TICKER}
Weakest = lowest P&L + no fresh confirmed signal.
Do NOT open new positions while over capacity — close one first.

CRITICAL EXIT RULES — execute these immediately:
- TRAILING STOP: Position was profitable then gave back gains → close to protect
- INTRADAY REVERSAL: Down today AND overall negative → no reason to hold, exit
- MOMENTUM LOSS: Was up today, now reversing → exit before gains evaporate
- DEAD MONEY: Held 3+ days with no progress → free up capital for better trades
- THESIS BREAK: Buy thesis flipped bearish → exit, reason to hold is gone
- When you see EXIT SIGNALS above → AUTO_EXECUTE the close, do not hold

CRITICAL EXECUTION RULE — READ THIS FIRST:
If you see confirmed signals (conviction ≥ 8) AND open positions < 5 AND trades remaining > 0:
YOU MUST RETURN AUTO_EXECUTE BUY decisions. DO NOT return SKIP.
Confirmed signals in the intelligence summary are READY TO TRADE. They have already been validated.
"No actionable decisions" is WRONG when confirmed high-conviction signals exist with capacity available.

CONFIRMED SIGNALS ALREADY VALIDATED — EXECUTE THESE:
${confirmedSignalsList}

DECISION RULES:
1. If confirmed signal exists + no position in that ticker + trades remaining → AUTO_EXECUTE buy (POST /api/trade/execute with body { ticker, side: "buy", conviction, rationale })
2. If position at profit target → AUTO_EXECUTE close
3. If stop loss breach → AUTO_EXECUTE close
4. If stale order → AUTO_EXECUTE cancel
5. Only SKIP if there are genuinely zero signals AND portfolio needs no maintenance
`
      : '';

  const modeInstruction =
    autonomy.trading_mode === 'day_trading' ? dayTradingInstruction : swingTradingInstruction;

  const staleOrderInstruction = `
STALE ORDER RULE: If you see pending buy orders where the current price is MORE THAN 2% 
away from the order's limit price, they are stale and will never fill.
ACTION: AUTO_EXECUTE GET /api/alpaca/orders/cancel-all to clear them.
Then re-queue fresh orders at current market prices.
This is PRIORITY — stale orders block capital and prevent fresh trades.
`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [
      {
        role: 'user',
        content: `You are Dark Recon's Autonomous Action Agent. You just refreshed all intelligence sources and have live data. Make decisions and execute.

${tierNote}
${autonomyInstruction}
${sectorInstruction}${macroInstruction}${pipelineInstruction}${modeInstruction}
${staleOrderInstruction}

FRESH PLATFORM STATUS (just gathered):
${status}

ACTIONS TAKEN IN LAST 30 MINUTES (avoid exact repetition):
${recentActionSummary}

AVAILABLE_ACTIONS:
- Dismiss triggered price alerts: GET /api/alerts/dismiss
- Check and update alerts: GET /api/alerts/check
- Cancel all stale open orders: GET /api/alpaca/orders/cancel-all
- Close specific position: GET /api/alpaca/positions/TICKER (replace TICKER with symbol)
- Execute trade entry: POST /api/trade/execute with body { ticker, side: "buy"|"sell", conviction, rationale }

DECISION RULES:
- AUTO_EXECUTE: Stop loss creation, alert dismissal, data refreshes, rebalance trims (in full autonomy)
- AUTO_EXECUTE (full autonomy only): Trade entries with conviction ≥ ${effectiveMinConviction} — use POST /api/trade/execute with ticker, side, conviction in body (NOT /api/trade/queue or /api/autonomy/execute)
- QUEUE_FOR_APPROVAL (non-autonomy): New trade entries, large position changes
- NOTIFY: Correlation warnings, approaching stops, cron failures, unusual patterns
- SKIP: Nothing actionable and no confirmed signals waiting — NEVER skip when high-conviction confirmed signals exist with open capacity

Return ONLY valid JSON array, max 6 decisions:
[
  {
    "action": "AUTO_EXECUTE",
    "issue": "Specific issue found",
    "rationale": "Why this action, what data supports it",
    "endpoint": "/api/endpoint",
    "method": "GET",
    "body": null,
    "priority": "high",
    "ticker": "NVDA"
  }
]

Be specific — reference actual tickers, prices, and data from the status above.
${autonomy.enabled ? 'In full autonomy mode, AUTO_EXECUTE qualifying trades directly — do not use QUEUE_FOR_APPROVAL.' : 'Never AUTO_EXECUTE trade entries — those always go to QUEUE_FOR_APPROVAL.'}`,
      },
    ],
  });

  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('');

  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');

  let decisions: AgentDecision[] = [];
  if (start !== -1 && end !== -1 && end > start) {
    try {
      decisions = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      try {
        const partial = cleaned.slice(start);
        const lastBrace = partial.lastIndexOf('},');
        if (lastBrace > 0) {
          decisions = JSON.parse(`${partial.slice(0, lastBrace + 1)}]`);
        } else {
          throw new Error('No partial JSON recoverable');
        }
      } catch {
        console.error('Agent parse error. Raw response:', raw.slice(0, 500));
        decisions = [
          {
            action: 'SKIP',
            issue: 'Response parse error',
            rationale: 'Could not parse agent decisions — check logs for raw response',
            priority: 'low',
          },
        ];
      }
    }
  } else {
    console.error('No JSON array found in agent response:', raw.slice(0, 500));
    decisions = [
      {
        action: 'SKIP',
        issue: 'No decisions found',
        rationale: 'Agent returned no actionable decisions this cycle',
        priority: 'low',
      },
    ];
  }

  const result: AgentRunResult = {
    ran_at: new Date().toISOString(),
    decisions,
    executed: 0,
    queued: 0,
    notified: 0,
    skipped: 0,
    errors: [],
    duration_ms: 0,
  };

  function isMaintenanceEndpoint(endpoint: string): boolean {
    return (
      endpoint.includes('alerts') ||
      endpoint.includes('cancel-all') ||
      endpoint.includes('scan') ||
      endpoint.includes('refresh')
    );
  }

  function isTradeEntryDecision(decision: AgentDecision): boolean {
    if (!decision.ticker) return false;
    const issue = (decision.issue || '').toLowerCase();
    const endpoint = decision.endpoint || '';
    if (endpoint && isMaintenanceEndpoint(endpoint)) return false;
    return (
      issue.includes('buy') ||
      issue.includes('entry') ||
      issue.includes('long') ||
      issue.includes('open position') ||
      issue.includes('swing') ||
      issue.includes('swing buy') ||
      issue.includes('reissue') ||
      endpoint.includes('trade/execute') ||
      endpoint.includes('trade/queue') ||
      endpoint.includes('autonomy/execute')
    );
  }

  for (const decision of decisions) {
    try {
      const effectiveAction =
        autonomy.enabled && decision.action === 'QUEUE_FOR_APPROVAL'
          ? 'AUTO_EXECUTE'
          : decision.action;

      if (
        effectiveAction === 'AUTO_EXECUTE' &&
        isTradeEntryDecision(decision) &&
        autonomy.enabled &&
        decision.ticker
      ) {
        const body = decision.body || {};
        const conviction =
          typeof body.conviction === 'number' ? body.conviction : autonomy.min_conviction;
        const side = (body.side as 'buy' | 'sell' | 'short') || 'buy';

        console.log(
          `[AGENT] Attempting trade execution: ${decision.ticker} — ${decision.issue?.slice(0, 50)}`
        );

        const execResult = await executeAutonomousTrade({
          ticker: decision.ticker,
          side,
          conviction,
          rationale: decision.rationale,
        });

        if (execResult.success) {
          console.log(
            `[AGENT] Trade executed: ${decision.ticker} — ${execResult.shares} shares @ $${execResult.price?.toFixed(2)}`
          );
          result.executed++;
          await logAuditEvent({
            event_type: 'autopilot_action_taken',
            ticker: decision.ticker,
            action_taken: `AUTONOMOUS TRADE [Tier ${tier}]: ${decision.issue}`,
            rationale: decision.rationale,
            outcome: 'pending',
            source: 'system',
            raw_data: {
              decision,
              tier,
              success: true,
              order_id: execResult.orderId,
              shares: execResult.shares,
              price: execResult.price,
            },
          });
        } else {
          console.error(
            `[AGENT] Trade failed: ${decision.ticker} — ${execResult.error || 'Trade execution failed'}`
          );
          result.skipped++;
          result.errors.push(
            `Trade failed for ${decision.ticker}: ${execResult.error || 'Trade execution failed'}`
          );
        }
      } else if (effectiveAction === 'AUTO_EXECUTE' && decision.endpoint) {
        const baseUrl = getBaseUrl();
        const res = await fetch(`${baseUrl}${decision.endpoint}`, {
          method: decision.method || 'GET',
          headers: { 'Content-Type': 'application/json' },
          body: decision.body ? JSON.stringify(decision.body) : undefined,
        });

        result.executed++;

        await logAuditEvent({
          event_type: 'autopilot_action_taken',
          ticker: decision.ticker,
          action_taken: `AUTONOMOUS [Tier ${tier}]: ${decision.issue}`,
          rationale: decision.rationale,
          outcome: 'not_applicable',
          source: 'system',
          raw_data: {
            decision,
            tier,
            success: res.ok,
            fresh_data_keys: Object.keys(fresh_data),
          },
        });
      } else if (
        effectiveAction === 'AUTO_EXECUTE' &&
        !decision.endpoint &&
        decision.ticker &&
        autonomy.enabled
      ) {
        const executed = await executeQueueTradeByTicker(decision.ticker);
        if (executed) {
          result.executed++;
          await logAuditEvent({
            event_type: 'autopilot_action_taken',
            ticker: decision.ticker,
            action_taken: `AUTONOMOUS TRADE [Tier ${tier}]: ${decision.issue}`,
            rationale: decision.rationale,
            outcome: 'pending',
            source: 'system',
            raw_data: { decision, tier, full_autonomy: true },
          });
        } else {
          result.skipped++;
        }
      } else if (decision.action === 'QUEUE_FOR_APPROVAL') {
        result.queued++;
        await logAuditEvent({
          event_type: 'trade_queue_built',
          ticker: decision.ticker,
          action_taken: `QUEUED [Tier ${tier}]: ${decision.issue}`,
          rationale: decision.rationale,
          outcome: 'pending',
          source: 'system',
        });
      } else if (decision.action === 'NOTIFY') {
        const { error: alertError } = await supabase.from('position_alerts').insert({
          ticker: decision.ticker || 'SYSTEM',
          alert_type: 'drawdown_warning',
          message: `🤖 [T${tier}] ${decision.issue} — ${decision.rationale}`,
          severity:
            decision.priority === 'critical'
              ? 'critical'
              : decision.priority === 'high'
                ? 'warning'
                : 'info',
          status: 'active',
          fired_at: new Date().toISOString(),
        });
        if (alertError) console.error(alertError);
        result.notified++;
      } else {
        result.skipped++;
      }
    } catch (e) {
      result.errors.push(`${decision.issue}: ${e instanceof Error ? e.message : 'Error'}`);
    }
  }

  result.duration_ms = Date.now() - startTime;

  const { error: cronError } = await supabase.from('cron_runs').insert({
    job_name: 'autonomous-agent',
    status: result.errors.length === 0 ? 'success' : 'partial',
    results: {
      tier,
      run_count: fresh_data.run_count,
      executed: result.executed,
      queued: result.queued,
      notified: result.notified,
      skipped: result.skipped,
      errors: result.errors,
      decisions: result.decisions.map((d) => ({
        action: d.action,
        issue: d.issue,
        rationale: d.rationale,
        ticker: d.ticker,
      })),
      platform_snapshot: status.slice(0, 500),
    },
    duration_ms: result.duration_ms,
    ran_at: result.ran_at,
  });
  if (cronError) console.error(cronError);

  return result;
}
