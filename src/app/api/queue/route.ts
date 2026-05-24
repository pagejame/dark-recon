import { NextRequest, NextResponse } from 'next/server';
import { buildTradeQueue, saveTradeQueue } from '@/lib/agents/trade-queue';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();

    await supabase
      .from('trade_queue')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString());

    const { data } = await supabase
      .from('trade_queue')
      .select('*')
      .in('status', ['pending', 'approved', 'executed'])
      .order('queued_at', { ascending: false })
      .limit(20);

    return NextResponse.json({ queue: data || [] });
  } catch {
    return NextResponse.json({ queue: [], error: 'Failed to load queue' });
  }
}

export async function POST(request: NextRequest) {
  const { action } = await request.json().catch(() => ({ action: 'build' }));

  if (action === 'build') {
    try {
      const trades = await buildTradeQueue();
      await saveTradeQueue(trades);
      return NextResponse.json({ queued: trades.length, trades });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Queue build failed';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
