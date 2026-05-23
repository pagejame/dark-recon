import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('cron_runs')
      .select('*')
      .order('ran_at', { ascending: false })
      .limit(5);
    return NextResponse.json({ runs: data || [] });
  } catch {
    return NextResponse.json({ runs: [] });
  }
}
