import { NextRequest, NextResponse } from 'next/server';
import { runFullMarketScan } from '@/lib/services/market-scanner';
import { loadMarketSymbols } from '@/lib/services/market-symbols';
import { createAdminClient } from '@/lib/supabase/admin';

let cache: { data: Record<string, unknown>; timestamp: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000;

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get('refresh') === 'true';

  if (!refresh && cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json({ ...cache.data, cached: true });
  }

  try {
    const supabase = createAdminClient();
    const { count } = await supabase
      .from('market_symbols')
      .select('*', { count: 'exact', head: true });

    if (!count || count < 100) {
      await loadMarketSymbols();
    }

    const result = await runFullMarketScan();
    cache = { data: result as unknown as Record<string, unknown>, timestamp: Date.now() };

    return NextResponse.json({
      ...result,
      cached: false,
      scanned_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Full market scan error:', error);
    return NextResponse.json({ error: 'Scan failed' }, { status: 500 });
  }
}
