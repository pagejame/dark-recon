import { NextResponse } from 'next/server';

const ALPACA_BASE = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';

export async function DELETE() {
  try {
    const res = await fetch(`${ALPACA_BASE}/v2/orders`, {
      method: 'DELETE',
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
        'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET || '',
      },
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ success: false, error: err }, { status: 500 });
    }

    const cancelled = res.status === 207 ? await res.json() : [];
    const count = Array.isArray(cancelled) ? cancelled.length : 0;

    return NextResponse.json({
      success: true,
      message:
        count > 0
          ? `✓ Cancelled ${count} pending order${count > 1 ? 's' : ''}`
          : '✓ No pending orders to cancel',
      count,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
