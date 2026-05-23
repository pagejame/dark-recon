// REQUIRED: Set CRON_SECRET in Vercel environment variables

import { NextRequest, NextResponse } from 'next/server';
import { generateAndSendWeeklyEmail } from '@/lib/services/weekly-email';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await generateAndSendWeeklyEmail();

  try {
    const supabase = createAdminClient();
    await supabase.from('cron_runs').insert({
      job_name: 'weekly-email',
      status: result.success ? 'success' : 'failed',
      results: { message: result.message },
      duration_ms: 0,
      ran_at: new Date().toISOString(),
    });
  } catch {
    // non-fatal
  }

  return NextResponse.json(result);
}
