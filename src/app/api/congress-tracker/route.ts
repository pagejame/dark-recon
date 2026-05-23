import { NextRequest, NextResponse } from 'next/server';
import { runCongressTracker, type CongressTrackerReport } from '@/lib/agents/congress-tracker';

let cache: { report: CongressTrackerReport; timestamp: number } | null = null;
const CACHE_TTL = 4 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get('refresh') === 'true';

  if (!refresh && cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json({ ...cache.report, cache: 'HIT' });
  }

  try {
    const report = await runCongressTracker();
    cache = { report, timestamp: Date.now() };
    return NextResponse.json({ ...report, cache: 'FRESH' });
  } catch (error) {
    console.error('Congress tracker error:', error);
    if (cache) return NextResponse.json({ ...cache.report, cache: 'STALE' });
    return NextResponse.json({ error: 'Congress tracker failed' }, { status: 500 });
  }
}
