import { NextRequest, NextResponse } from 'next/server';
import { buildEarningsPlays, queueEarningsPlays } from '@/lib/agents/earnings-play';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();

    const { data: watchlist } = await supabase.from('watchlist').select('ticker');

    const watchlistTickers = (watchlist || []).map((w: { ticker: string }) => w.ticker);

    const defaultTickers = [
      'NVDA',
      'META',
      'AAPL',
      'MSFT',
      'AMZN',
      'GOOGL',
      'TSLA',
      'AMD',
      'LLY',
      'JPM',
      'GS',
      'GM',
      'QQQ',
    ];
    const allTickers = [...new Set([...watchlistTickers, ...defaultTickers])];

    const plays = await buildEarningsPlays(allTickers);
    const queued = await queueEarningsPlays(plays);

    await supabase.from('cron_runs').insert({
      job_name: 'earnings-plays',
      status: 'success',
      results: { plays_found: plays.length, queued },
      ran_at: new Date().toISOString(),
    });

    return NextResponse.json({ plays_found: plays.length, queued });
  } catch (error) {
    console.error('Earnings plays cron error:', error);
    return NextResponse.json({ error: 'Earnings plays failed' }, { status: 500 });
  }
}
