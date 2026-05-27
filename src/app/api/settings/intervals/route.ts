import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const DEFAULT_INTERVALS = {
  profit_check_minutes: 30,
  agent_loop_minutes: 30,
  position_monitor_minutes: 10,
  alert_check_minutes: 15,
};

export async function GET() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'check_intervals')
    .maybeSingle();

  return NextResponse.json(data?.value || DEFAULT_INTERVALS);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    await supabase.from('settings').upsert(
      {
        key: 'check_intervals',
        value: {
          profit_check_minutes: body.profit_check_minutes || 30,
          agent_loop_minutes: body.agent_loop_minutes || 30,
          position_monitor_minutes: body.position_monitor_minutes || 10,
          alert_check_minutes: body.alert_check_minutes || 15,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
