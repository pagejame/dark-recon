// REQUIRED: Set CRON_SECRET in Vercel environment variables
// Generate with: openssl rand -hex 32
// Add to Vercel: Settings -> Environment Variables -> CRON_SECRET

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkPriceAlerts } from '@/lib/agents/price-alerts';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const supabase = createAdminClient();
    const result = await checkPriceAlerts(supabase);

    await supabase.from('cron_runs').insert({
      job_name: 'alert-check',
      status: 'success',
      results: { triggered: result.triggered.length, checked: result.checked },
      duration_ms: Date.now() - startTime,
      ran_at: new Date().toISOString(),
    });

    return NextResponse.json({
      triggered: result.triggered.length,
      checked: result.checked,
    });
  } catch (error) {
    console.error('Alert check cron error:', error);
    return NextResponse.json({ error: 'Alert check failed' }, { status: 500 });
  }
}
