import { NextRequest, NextResponse } from 'next/server';
import { scanPositionNews } from '@/lib/services/position-news';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const alerts = await scanPositionNews();
    const supabase = createAdminClient();
    await supabase.from('cron_runs').insert({
      job_name: 'position-news',
      status: 'success',
      results: {
        alerts_found: alerts.length,
        high_urgency: alerts.filter((a) => a.urgency === 'high').length,
      },
      ran_at: new Date().toISOString(),
    });
    return NextResponse.json({ alerts_found: alerts.length });
  } catch (error) {
    console.error('Position news cron error:', error);
    return NextResponse.json({ error: 'Position news scan failed' }, { status: 500 });
  }
}
