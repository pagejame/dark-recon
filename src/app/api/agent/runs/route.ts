import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runAutonomousAgent } from '@/lib/agents/autonomous';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20', 10);

    const { data } = await supabase
      .from('cron_runs')
      .select('*')
      .eq('job_name', 'autonomous-agent')
      .order('ran_at', { ascending: false })
      .limit(limit);

    return NextResponse.json({ runs: data || [] });
  } catch {
    return NextResponse.json({ runs: [] });
  }
}

export async function POST() {
  try {
    const result = await runAutonomousAgent();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
