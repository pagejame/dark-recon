import { NextRequest, NextResponse } from 'next/server';
import {
  getStrategyConfig,
  getStrategyPerformance,
  updateStrategyConfig,
  takeStrategySnapshot,
} from '@/lib/services/strategy';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type') || 'performance';

  try {
    if (type === 'config') {
      const config = await getStrategyConfig();
      return NextResponse.json(config);
    }

    if (type === 'decisions') {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from('strategy_decisions')
        .select('*')
        .order('decision_date', { ascending: false })
        .limit(50);
      return NextResponse.json({ decisions: data || [] });
    }

    if (type === 'snapshots') {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from('strategy_snapshots')
        .select('*')
        .order('snapshot_date', { ascending: true })
        .limit(90);
      return NextResponse.json({ snapshots: data || [] });
    }

    const [performance, config] = await Promise.all([
      getStrategyPerformance(),
      getStrategyConfig(),
    ]);

    takeStrategySnapshot().catch(console.error);

    return NextResponse.json({ performance, config });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Strategy error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const updates = await request.json();
    await updateStrategyConfig(updates);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
