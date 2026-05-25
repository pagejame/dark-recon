import { NextRequest, NextResponse } from 'next/server';
import { runFullMarketScan } from '@/lib/services/market-scanner';
import { runMomentumScreener, saveMomentumResults } from '@/lib/services/momentum-screener';
import { getSectorRotation } from '@/lib/services/sector-rotation';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const startTime = Date.now();

  try {
    const [scanResult, momentumData, sectorData] = await Promise.all([
      runFullMarketScan(),
      runMomentumScreener(),
      getSectorRotation(),
    ]);

    await saveMomentumResults(momentumData);

    await supabase.from('settings').upsert(
      {
        key: 'latest_sector_rotation',
        value: sectorData,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

    const duration = Date.now() - startTime;

    await supabase.from('cron_runs').insert({
      job_name: 'market-scan',
      status: 'success',
      results: {
        total_scanned: scanResult.total_scanned,
        signals_found: scanResult.signals.length,
        top_opportunities: scanResult.top_opportunities.length,
        auto_added: scanResult.auto_added,
        sector_regime: sectorData.market_regime,
        momentum_leaders: momentumData.high_momentum.slice(0, 5).map((s) => s.ticker),
      },
      duration_ms: duration,
      ran_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      total_scanned: scanResult.total_scanned,
      signals: scanResult.signals.length,
      top_opportunities: scanResult.top_opportunities.length,
      auto_added: scanResult.auto_added,
      sector_regime: sectorData.market_regime,
      rotation_signal: sectorData.rotation_signal,
      momentum_leaders: momentumData.high_momentum
        .slice(0, 5)
        .map((s) => `${s.ticker} ${s.change_1d >= 0 ? '+' : ''}${s.change_1d.toFixed(2)}%`),
      duration_ms: duration,
    });
  } catch (error) {
    console.error('Market scan cron error:', error);
    try {
      await supabase.from('cron_runs').insert({
        job_name: 'market-scan',
        status: 'failed',
        results: { error: String(error) },
        ran_at: new Date().toISOString(),
      });
    } catch (logError) {
      console.error('Failed to log market scan failure:', logError);
    }
    return NextResponse.json({ error: 'Market scan failed' }, { status: 500 });
  }
}
