import { NextRequest, NextResponse } from 'next/server';
import { createStopLoss } from '@/lib/services/stoploss';

export async function POST(request: NextRequest) {
  try {
    const { ticker, position_type, entry_price, stop_pct } = await request.json();
    if (!ticker || !position_type || entry_price === undefined) {
      return NextResponse.json(
        { error: 'ticker, position_type, entry_price required' },
        { status: 400 }
      );
    }

    const result = await createStopLoss({
      ticker,
      position_type,
      entry_price: parseFloat(String(entry_price)),
      stop_pct: stop_pct ? parseFloat(String(stop_pct)) : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stop loss failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
