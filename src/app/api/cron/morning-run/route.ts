// REQUIRED: Set CRON_SECRET in Vercel environment variables
// Generate with: openssl rand -hex 32
// Add to Vercel: Settings -> Environment Variables -> CRON_SECRET

import { NextRequest, NextResponse } from 'next/server';
import { generateMorningBriefing } from '@/lib/agents/briefing';
import { runMarketScan } from '@/lib/agents/scanner';
import { runAutopilot } from '@/lib/agents/autopilot';
import { saveBriefing } from '@/lib/db/briefings';
import { createAdminClient } from '@/lib/supabase/admin';
import { takeStrategySnapshot } from '@/lib/services/strategy';
import { buildTradeQueue, saveTradeQueue } from '@/lib/agents/trade-queue';
import { runOutcomeTracker } from '@/lib/agents/outcome-tracker';
import { buildEarningsPlays, queueEarningsPlays } from '@/lib/agents/earnings-play';
import { runRebalanceCheck } from '@/lib/agents/rebalance';
import { calculateSignalWeights } from '@/lib/services/signal-learning';
import { runWatchlistAutoPop } from '@/lib/services/watchlist-autopop';
import { autoExecutePendingTrades } from '@/lib/services/autonomy';
import { runFullMarketScan } from '@/lib/services/market-scanner';
import { runMomentumScreener, saveMomentumResults } from '@/lib/services/momentum-screener';
import { getSectorRotation } from '@/lib/services/sector-rotation';
import { getFearGreedIndex, getUpcomingEconomicEvents } from '@/lib/api/market-sentiment';
import { getRecentInsiderTrades, getUpcomingIPOs } from '@/lib/api/fmp';

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, string> = {};
  const startTime = Date.now();

  console.log('Dark Recon morning run starting...');

  try {
    const supabase = createAdminClient();
    await supabase
      .from('signals')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('created_at', new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString());
  } catch (e) {
    console.error('Morning signal cleanup error:', e);
  }

  try {
    await fetch('https://paper-api.alpaca.markets/v2/orders', {
      method: 'DELETE',
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
        'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET || '',
      },
    });
    results.stale_orders_cleared = 'All open orders cancelled at market open';
  } catch {
    /* non-fatal */
  }

  const [
    briefingResult,
    scanResult,
    autopilotResult,
    snapshotResult,
    outcomeResult,
    rebalanceResult,
    signalWeightsResult,
  ] = await Promise.allSettled([
    generateMorningBriefing(),
    runMarketScan(),
    runAutopilot(),
    takeStrategySnapshot(),
    runOutcomeTracker(),
    runRebalanceCheck(),
    calculateSignalWeights(),
  ]);

  if (briefingResult.status === 'fulfilled') {
    try {
      const saved = await saveBriefing({
        date: briefingResult.value.date,
        market_status: briefingResult.value.market_status,
        sentiment: briefingResult.value.sentiment,
        briefing_text: briefingResult.value.briefing_text,
        top_signals: briefingResult.value.top_signals,
        key_levels: briefingResult.value.key_levels,
        premarket_data: briefingResult.value.pre_market ?? null,
        limit_order_assessments: briefingResult.value.limit_order_assessments ?? [],
      });
      results.briefing = saved ? 'SUCCESS' : 'SAVE_FAILED';
    } catch {
      results.briefing = 'SAVE_FAILED';
    }
  } else {
    results.briefing = 'FAILED';
    console.error('Briefing failed:', briefingResult.reason);
  }

  if (scanResult.status === 'fulfilled') {
    try {
      const supabase = createAdminClient();
      for (const signal of scanResult.value) {
        await supabase.from('signals').insert({
          ticker: signal.ticker,
          signal_type: signal.signal_type,
          strength: signal.strength,
          summary: signal.summary,
          status: 'pending',
          scanned_at: signal.scanned_at,
        });
      }
      results.scanner = `SUCCESS — ${scanResult.value.length} signals`;
    } catch {
      results.scanner = 'SAVE_FAILED';
    }
  } else {
    results.scanner = 'FAILED';
    console.error('Scanner failed:', scanResult.reason);
  }

  if (autopilotResult.status === 'fulfilled') {
    try {
      const supabase = createAdminClient();
      const report = autopilotResult.value;
      await supabase.from('autopilot_reports').insert({
        date: report.date,
        market_sentiment: report.market_sentiment,
        overall_action: report.overall_action,
        report_text: report.report_text,
        action_items: report.action_items,
        positions_review: report.positions_review,
        top_opportunities: report.top_opportunities,
        risk_flags: report.risk_flags,
        generated_at: report.generated_at,
      });
      results.autopilot = 'SUCCESS';
    } catch {
      results.autopilot = 'SAVE_FAILED';
    }
  } else {
    results.autopilot = 'FAILED';
    console.error('Autopilot failed:', autopilotResult.reason);
  }

  if (snapshotResult.status === 'fulfilled') {
    results.strategy_snapshot = 'SUCCESS';
  } else {
    results.strategy_snapshot = 'FAILED';
    console.error('Strategy snapshot failed:', snapshotResult.reason);
  }

  if (outcomeResult.status === 'fulfilled') {
    const r = outcomeResult.value;
    results.outcome_tracker = `SUCCESS — ${r.outcomes_updated} updated, ${r.new_outcomes_created} new`;
  } else {
    results.outcome_tracker = 'FAILED';
    console.error('Outcome tracker failed:', outcomeResult.reason);
  }

  if (rebalanceResult.status === 'fulfilled') {
    const immediate = rebalanceResult.value.filter((a) => a.urgency === 'immediate').length;
    results.rebalance = `SUCCESS — ${rebalanceResult.value.length} actions, ${immediate} immediate`;
  } else {
    results.rebalance = 'FAILED';
    console.error('Rebalance check failed:', rebalanceResult.reason);
  }

  if (signalWeightsResult.status === 'fulfilled') {
    const w = signalWeightsResult.value;
    results.signal_learning = `SUCCESS — ${Object.keys(w.weights).length} signal types, ${w.total_signals_tracked} outcomes tracked`;
  } else {
    results.signal_learning = 'FAILED';
    console.error('Signal weights failed:', signalWeightsResult.reason);
  }

  try {
    const trades = await buildTradeQueue();
    await saveTradeQueue(trades);
    results.trade_queue = `SUCCESS — ${trades.length} trades queued`;

    try {
      const executed = await autoExecutePendingTrades();
      if (executed.length > 0) {
        results.autonomous_trades = executed.join(' ');
      }
    } catch (e) {
      console.error('Autonomy trade execution error:', e);
    }
  } catch (e) {
    results.trade_queue = 'FAILED';
    console.error('Trade queue build error:', e);
  }

  try {
    const supabase = createAdminClient();
    const { data: watchlist } = await supabase.from('watchlist').select('ticker');
    const watchlistTickers = (watchlist || []).map((w: { ticker: string }) => w.ticker);
    const defaultTickers = ['NVDA', 'META', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'TSLA', 'AMD', 'LLY', 'GM'];
    const allTickers = [...new Set([...watchlistTickers, ...defaultTickers])];

    const earningsPlays = await buildEarningsPlays(allTickers);
    const earningsQueued = await queueEarningsPlays(earningsPlays);
    results.earnings_plays = `SUCCESS — ${earningsQueued} plays queued`;

    try {
      const earningsExecuted = await autoExecutePendingTrades({
        earningsOnly: true,
        minConvictionOverride: 7,
      });
      if (earningsExecuted.length > 0) {
        results.autonomous_earnings = earningsExecuted.join(' ');
      }
    } catch (e) {
      console.error('Autonomy earnings execution error:', e);
    }
  } catch (e) {
    results.earnings_plays = 'FAILED';
    console.error('Earnings plays error:', e);
  }

  try {
    const autopopResult = await runWatchlistAutoPop();
    results.watchlist_autopop = `SUCCESS — ${autopopResult.added.length} tickers added`;
  } catch {
    results.watchlist_autopop = 'FAILED';
    console.error('Watchlist autopop failed');
  }

  void Promise.all([
    runMomentumScreener()
      .then((data) => saveMomentumResults(data))
      .then(() => {
        results.momentum_scan = 'SUCCESS';
      })
      .catch(() => {
        results.momentum_scan = 'FAILED';
      }),
    getSectorRotation()
      .then((rotation) => {
        results.sector_rotation = `${rotation.market_regime.toUpperCase()} — ${rotation.rotation_signal.slice(0, 100)}`;
      })
      .catch(() => {
        results.sector_rotation = 'FAILED';
      }),
  ]);

  runFullMarketScan()
    .then((scanResult) => {
      results.market_scan = `SUCCESS — ${scanResult.total_scanned} stocks scanned, ${scanResult.top_opportunities.length} opportunities found, ${scanResult.auto_added.length} added to watchlist`;
      if (scanResult.auto_added.length > 0) {
        results.market_scan_additions = scanResult.auto_added.join(', ');
      }
    })
    .catch((e) => {
      results.market_scan = 'FAILED';
      console.error('Market scan error:', e);
    });

  await Promise.all([
    getFearGreedIndex()
      .then((fg) => {
        if (fg) results.fear_greed = `${fg.label} (${fg.value}/100) — ${fg.trading_signal}`;
      })
      .catch(() => {}),
    getUpcomingEconomicEvents()
      .then((events) => {
        const today = events.filter((e) => e.is_today);
        results.economic_calendar =
          today.length > 0
            ? `${today.length} HIGH IMPACT events today: ${today.map((e) => e.event).join(', ')}`
            : 'No high-impact events today';
      })
      .catch(() => {}),
    getRecentInsiderTrades(10)
      .then((trades) => {
        results.insider_trades = `${trades.filter((t) => t.signal_strength === 'high').length} large insider purchases`;
      })
      .catch(() => {}),
    getUpcomingIPOs()
      .then((ipos) => {
        results.ipos = `${ipos.length} upcoming IPOs`;
      })
      .catch(() => {}),
  ]);

  try {
    const supabase = createAdminClient();
    await supabase.from('cron_runs').insert({
      job_name: 'morning-run',
      status: Object.values(results).every((r) => r.includes('SUCCESS')) ? 'success' : 'partial',
      results,
      duration_ms: Date.now() - startTime,
      ran_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Failed to log cron run:', e);
  }

  console.log('Morning run complete:', results);
  return NextResponse.json({
    success: true,
    results,
    duration_ms: Date.now() - startTime,
  });
}
