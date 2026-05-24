import { NextRequest, NextResponse } from 'next/server';
import { runPositionMonitor } from '@/lib/agents/position-monitor';
import { runAutoClose } from '@/lib/services/auto-close';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runPositionMonitor();

    try {
      const closeResults = await runAutoClose(false);
      if (closeResults.length > 0) {
        console.log('Auto-close actions:', closeResults);
      }
    } catch (e) {
      console.error('Auto-close error (non-fatal):', e);
    }

    const supabase = createAdminClient();
    await supabase.from('cron_runs').insert({
      job_name: 'position-monitor',
      status: 'success',
      results: {
        alerts_fired: result.alerts_fired,
        positions_checked: result.positions_checked,
      },
      ran_at: new Date().toISOString(),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Position monitor cron error:', error);
    return NextResponse.json({ error: 'Position monitor failed' }, { status: 500 });
  }
}
