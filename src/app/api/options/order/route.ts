import { NextRequest, NextResponse } from 'next/server';
import { placeOptionsOrder } from '@/lib/api/alpaca';

export async function POST(request: NextRequest) {
  try {
    const { symbol, qty, side, type, limit_price } = await request.json();

    if (!symbol || !qty || !side) {
      return NextResponse.json({ error: 'symbol, qty, side required' }, { status: 400 });
    }

    if (!/^[A-Z]{1,5}\d{6}[CP]\d{8}$/.test(symbol)) {
      return NextResponse.json({ error: 'Invalid OCC options symbol format' }, { status: 400 });
    }

    const order = await placeOptionsOrder({
      symbol,
      qty: parseInt(String(qty), 10),
      side,
      type: type || 'market',
      limit_price: limit_price ? parseFloat(String(limit_price)) : undefined,
    });

    return NextResponse.json(order);
  } catch (error) {
    console.error('Options order error:', error);
    const message = error instanceof Error ? error.message : 'Options order failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
