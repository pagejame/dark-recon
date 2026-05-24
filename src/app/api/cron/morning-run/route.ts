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

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, string> = {};
  const startTime = Date.now();

  console.log('Dark Recon morning run starting...');

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
