import { NextRequest, NextResponse } from 'next/server';
import { getOrders, submitMarketOrder, submitLimitOrder } from '@/lib/api/alpaca';

export async function GET() {
  try {
    const orders = await getOrders('all', 20);
    return NextResponse.json({ orders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get orders';
    return NextResponse.json({ error: message, orders: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, qty, side, order_type, limit_price } = body;

    if (!symbol || !qty || !side) {
      return NextResponse.json({ error: 'symbol, qty, side required' }, { status: 400 });
    }

    const orderPayload = {
      symbol: String(symbol).toUpperCase(),
      qty: Number(qty),
      side: side as 'buy' | 'sell',
    };

    let order;
    if (order_type === 'limit' && limit_price) {
      order = await submitLimitOrder({ ...orderPayload, limit_price: Number(limit_price) });
    } else {
      order = await submitMarketOrder(orderPayload);
    }

    return NextResponse.json(order);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Order failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
