import { NextRequest, NextResponse } from 'next/server';
import { sendDailyPnLSummary } from '@/lib/services/daily-pnl';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await sendDailyPnLSummary();

  try {
    const supabase = createAdminClient();
    await supabase.from('cron_runs').insert({
      job_name: 'eod-summary',
      status: result.success ? 'success' : 'failed',
      results: { message: result.message },
      ran_at: new Date().toISOString(),
    });
  } catch {
    /* non-fatal */
  }

  return NextResponse.json(result);
}
