import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('position_alerts')
      .select('*')
      .eq('status', 'active')
      .order('fired_at', { ascending: false })
      .limit(20);
    return NextResponse.json({ alerts: data || [] });
  } catch {
    return NextResponse.json({ alerts: [] });
  }
}

export async function PATCH() {
  try {
    const supabase = createAdminClient();
    await supabase
      .from('position_alerts')
      .update({ status: 'dismissed', dismissed_at: new Date().toISOString() })
      .eq('status', 'active');
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to dismiss' }, { status: 500 });
  }
}
