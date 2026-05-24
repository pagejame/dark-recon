import { NextResponse } from 'next/server';
import { getPositions } from '@/lib/api/alpaca';

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';

const INDEX_TICKERS = ['SPY', 'QQQ', 'DIA', 'IWM'];

let tickerCache: { data: TickerItem[]; timestamp: number } | null = null;
const CACHE_TTL = 60 * 1000;

export interface TickerItem {
  ticker: string;
  price: number;
  change: number;
  change_pct: number;
  is_position: boolean;
  is_index: boolean;
}

const OCC_SYMBOL = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/;

async function getFinnhubQuote(
  ticker: string
): Promise<{ price: number; change: number; change_pct: number } | null> {
  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}`, {
      headers: { 'X-Finnhub-Token': FINNHUB_KEY },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.c) return null;
    return {
      price: data.c,
      change: data.d || 0,
      change_pct: data.dp || 0,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  if (tickerCache && Date.now() - tickerCache.timestamp < CACHE_TTL) {
    return NextResponse.json({ items: tickerCache.data, cached: true });
  }

  try {
    let positionTickers: string[] = [];
    try {
      const positions = await getPositions();
      positionTickers = (positions || [])
        .map((p: { symbol: string }) => {
          const sym = p.symbol;
          return OCC_SYMBOL.test(sym) ? sym.replace(/\d.*/, '') : sym;
        })
        .filter((t: string, i: number, arr: string[]) => arr.indexOf(t) === i);
    } catch {
      // non-fatal
    }

    const allTickers = [...new Set([...INDEX_TICKERS, ...positionTickers])];

    const quotes = await Promise.all(
      allTickers.map(async (ticker) => {
        const quote = await getFinnhubQuote(ticker);
        if (!quote) return null;
        return {
          ticker,
          price: quote.price,
          change: quote.change,
          change_pct: quote.change_pct,
          is_position: positionTickers.includes(ticker),
          is_index: INDEX_TICKERS.includes(ticker),
        } as TickerItem;
      })
    );

    const items = quotes.filter(Boolean) as TickerItem[];

    const ordered = [
      ...items.filter((i) => i.is_index),
      ...items.filter((i) => i.is_position && !i.is_index),
    ];

    tickerCache = { data: ordered, timestamp: Date.now() };

    return NextResponse.json({
      items: ordered,
      cached: false,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Ticker API error:', error);
    return NextResponse.json({ items: [], error: 'Ticker fetch failed' });
  }
}
