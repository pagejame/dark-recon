import { NextRequest, NextResponse } from 'next/server';
import { getOptionsChainForTicker, getLatestQuote } from '@/lib/api/alpaca';
import type { OptionsChainResult } from '@/lib/api/alpaca';

const chainCache = new Map<string, { data: OptionsChainResult; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker');
  const type = request.nextUrl.searchParams.get('type') as 'call' | 'put' | null;
  const expiration = request.nextUrl.searchParams.get('expiration');
  const minStrike = request.nextUrl.searchParams.get('min_strike');
  const maxStrike = request.nextUrl.searchParams.get('max_strike');
  const fresh = request.nextUrl.searchParams.get('fresh') === 'true';

  if (!ticker) {
    return NextResponse.json({ error: 'ticker required' }, { status: 400 });
  }

  const upperTicker = ticker.toUpperCase();
  const cacheKey = `${upperTicker}-${type}-${expiration}-${minStrike}-${maxStrike}`;

  if (!fresh) {
    const cached = chainCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({ ...cached.data, cache: 'HIT' });
    }
  }

  try {
    let currentPrice: number | undefined;
    try {
      const quote = await getLatestQuote(upperTicker);
      currentPrice = quote?.quote?.ap || quote?.quote?.bp || undefined;
    } catch {
      // Non-fatal
    }

    const today = new Date().toISOString().split('T')[0];
    const ninetyDays = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    let strikePriceGte: number | undefined;
    let strikePriceLte: number | undefined;

    if (currentPrice) {
      strikePriceGte = minStrike ? parseFloat(minStrike) : Math.floor(currentPrice * 0.7);
      strikePriceLte = maxStrike ? parseFloat(maxStrike) : Math.ceil(currentPrice * 1.3);
    } else {
      strikePriceGte = minStrike ? parseFloat(minStrike) : undefined;
      strikePriceLte = maxStrike ? parseFloat(maxStrike) : undefined;
    }

    const chain = await getOptionsChainForTicker(upperTicker, {
      type: type || undefined,
      expirationDateGte: expiration || today,
      expirationDateLte: expiration || ninetyDays,
      strikePriceGte,
      strikePriceLte,
      currentPrice,
      limit: 500,
    });

    const result = { ...chain, current_price: currentPrice || chain.current_price };
    chainCache.set(cacheKey, { data: result, timestamp: Date.now() });

    return NextResponse.json({ ...result, cache: 'MISS' });
  } catch (error) {
    console.error('Options chain error:', error);
    const message = error instanceof Error ? error.message : 'Options chain failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
