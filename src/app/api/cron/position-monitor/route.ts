import { NextRequest, NextResponse } from 'next/server';
import { runPositionMonitor } from '@/lib/agents/position-monitor';
import { runAutoClose } from '@/lib/services/auto-close';
import { sendAlertEscalationEmail } from '@/lib/services/alert-escalation';
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
      const closeResults = await runAutoClose();
      if (closeResults.length > 0) {
        console.log('Auto-close actions:', closeResults);
      }
    } catch (e) {
      console.error('Auto-close error (non-fatal):', e);
    }

    const supabase = createAdminClient();

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: unacknowledged } = await supabase
      .from('position_alerts')
      .select('*')
      .eq('severity', 'critical')
      .eq('status', 'active')
      .lt('fired_at', twoHoursAgo);

    if (unacknowledged && unacknowledged.length > 0) {
      try {
        await sendAlertEscalationEmail(unacknowledged);
      } catch (e) {
        console.error('Alert escalation email error (non-fatal):', e);
      }
    }

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
