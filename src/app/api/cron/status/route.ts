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

    const { data: agentRun } = await supabase
      .from('cron_runs')
      .select('*')
      .in('job_name', ['autonomous-agent', 'agent-loop'])
      .order('ran_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ runs: data || [], autonomous_agent: agentRun || null });
  } catch {
    return NextResponse.json({ runs: [], autonomous_agent: null });
  }
}
