import { NextRequest, NextResponse } from 'next/server';
import { runOutcomeTracker } from '@/lib/agents/outcome-tracker';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runOutcomeTracker();

    const supabase = createAdminClient();
    await supabase.from('cron_runs').insert({
      job_name: 'outcome-tracker',
      status: 'success',
      results: result,
      ran_at: new Date().toISOString(),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Outcome tracker cron error:', error);
    return NextResponse.json({ error: 'Outcome tracker failed' }, { status: 500 });
  }
}
