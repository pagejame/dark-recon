import { NextResponse } from 'next/server';
import { getUnusualOptionsFlow, type OptionsFlowSignal } from '@/lib/api/options-flow';

let cache: { data: OptionsFlowSignal[]; timestamp: number } | null = null;
const CACHE_TTL = 15 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return NextResponse.json({ signals: cache.data, cached: true, count: cache.data.length });
  }

  try {
    const signals = await getUnusualOptionsFlow();
    cache = { data: signals, timestamp: Date.now() };
    return NextResponse.json({ signals, count: signals.length, cached: false });
  } catch {
    return NextResponse.json({ signals: [], error: 'Options flow failed' });
  }
}
