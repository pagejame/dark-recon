import { NextRequest, NextResponse } from 'next/server';
import { checkAndExecuteProfitTargets } from '@/lib/services/profit-targets';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await checkAndExecuteProfitTargets();
    const actions = results.filter((r) => r.action !== 'hold' && r.action !== 'trail_stop');
    return NextResponse.json({
      checked: results.length,
      actions: actions.length,
      details: actions,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
