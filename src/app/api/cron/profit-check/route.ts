import { NextRequest, NextResponse } from 'next/server';
import { runExitLogic } from '@/lib/services/exit-logic';
import { checkAndExecuteProfitTargets } from '@/lib/services/profit-targets';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [profitResults, exitResults] = await Promise.all([
      checkAndExecuteProfitTargets(),
      runExitLogic(),
    ]);

    const profitActions = profitResults.filter(
      (r) => r.action !== 'hold' && r.action !== 'trail_stop'
    );
    const exitActions = exitResults.filter((s) => s.urgency === 'immediate');

    const supabase = createAdminClient();
    try {
      await supabase.from('cron_runs').insert({
        job_name: 'profit-check',
        status: 'success',
        results: {
          profit_checks: profitResults.length,
          profit_actions: profitActions.length,
          exit_checks: exitResults.length,
          exit_actions: exitActions.length,
          exits: exitActions.map((s) => ({
            ticker: s.ticker,
            type: s.exit_type,
            pnl: s.pnl_pct,
            reason: s.reason.slice(0, 100),
          })),
        },
        ran_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Profit-check cron log error (non-fatal):', e);
    }

    return NextResponse.json({
      success: true,
      profit_actions: profitActions.length,
      exit_actions: exitActions.length,
      exits: exitActions.map(
        (s) => `${s.ticker}: ${s.exit_type} (${s.pnl_pct.toFixed(2)}%)`
      ),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
