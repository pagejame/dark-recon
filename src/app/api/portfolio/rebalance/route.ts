import { NextResponse } from 'next/server';
import { runRebalanceCheck } from '@/lib/agents/rebalance';

export async function GET() {
  try {
    const actions = await runRebalanceCheck();
    const hasImmediate = actions.some((a) => a.urgency === 'immediate');
    return NextResponse.json({ actions, has_immediate: hasImmediate, count: actions.length });
  } catch (error) {
    console.error('Rebalance API error:', error);
    return NextResponse.json({ actions: [], error: 'Rebalance check failed' });
  }
}
