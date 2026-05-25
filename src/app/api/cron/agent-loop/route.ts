import { NextRequest, NextResponse } from 'next/server';
import { runAutonomousAgent } from '@/lib/agents/autonomous';
import { checkAndExecuteProfitTargets } from '@/lib/services/profit-targets';
import { detectIntradaySetups } from '@/lib/services/intraday-signals';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAutonomyConfig } from '@/lib/services/autonomy';

export const maxDuration = 55;

function isMarketHours(): boolean {
  const now = new Date();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const day = now.getUTCDay();
  if (day < 1 || day > 5) return false;
  const totalMinutes = hour * 60 + minute;
  return totalMinutes >= 13 * 60 + 30 && totalMinutes < 20 * 60;
}

function isPreMarket(): boolean {
  const now = new Date();
  const hour = now.getUTCHours();
  const day = now.getUTCDay();
  return day >= 1 && day <= 5 && hour >= 8 && hour < 13;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const startTime = Date.now();

  if (!isMarketHours() && !isPreMarket()) {
    return NextResponse.json({ skipped: true, reason: 'Market closed' });
  }

  try {
    const config = await getAutonomyConfig();
    if (!config.enabled) {
      return NextResponse.json({ skipped: true, reason: 'Autonomy disabled' });
    }

    const results: Record<string, unknown> = {};

    try {
      const profitResults = await checkAndExecuteProfitTargets();
      const actions = profitResults.filter((r) => r.action !== 'hold');
      results.profit_targets = `${actions.length} actions taken`;
      if (actions.length > 0) {
        results.profit_target_details = actions.map(
          (a) => `${a.ticker}: ${a.action} at ${a.pnl_pct >= 0 ? '+' : ''}${a.pnl_pct.toFixed(2)}%`
        );
      }
    } catch {
      results.profit_targets = 'ERROR';
    }

    try {
      const [watchlistResult, scannerResult] = await Promise.all([
        supabase.from('watchlist').select('ticker').limit(20),
        supabase
          .from('scanner_results')
          .select('ticker')
          .eq('scan_date', new Date().toISOString().split('T')[0])
          .gte('conviction_score', 7)
          .limit(10),
      ]);

      const watchlistTickers = (watchlistResult.data || []).map((w: { ticker: string }) => w.ticker);
      const scannerTickers = (scannerResult.data || []).map((s: { ticker: string }) => s.ticker);
      const allTickers = [...new Set([...watchlistTickers, ...scannerTickers])].slice(0, 25);

      const intradaySignals = await detectIntradaySetups(allTickers);
      results.intraday_setups = `${intradaySignals.length} setups detected`;

      for (const signal of intradaySignals.filter((s) => s.conviction >= 7)) {
        try {
          await supabase.from('signals').insert({
            ticker: signal.ticker,
            signal_type: signal.setup_type,
            strength: signal.conviction >= 8 ? 'high' : 'medium',
            status: 'pending',
            source: `Intraday: ${signal.setup_type}`,
            notes: signal.reason,
            summary: signal.reason,
            created_at: new Date().toISOString(),
          });
        } catch (e) {
          console.error('Intraday signal insert error:', e);
        }
      }
    } catch {
      results.intraday_setups = 'ERROR';
    }

    try {
      const agentResult = await runAutonomousAgent();
      results.agent = {
        executed: agentResult.executed,
        queued: agentResult.queued,
        notified: agentResult.notified,
        decisions: agentResult.decisions.length,
      };
    } catch {
      results.agent = 'ERROR';
    }

    const duration = Date.now() - startTime;

    try {
      await supabase.from('cron_runs').insert({
        job_name: 'agent-loop',
        status: 'success',
        results,
        duration_ms: duration,
        ran_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Agent loop cron log error:', e);
    }

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      market_hours: isMarketHours(),
      ...results,
    });
  } catch (error) {
    console.error('Agent loop error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
