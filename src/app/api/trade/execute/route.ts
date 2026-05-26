import { NextRequest, NextResponse } from 'next/server';
import { executeAutonomousTrade } from '@/lib/services/autonomy';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticker, side, conviction, rationale } = body;

    if (!ticker || !side) {
      return NextResponse.json({ error: 'ticker and side required' }, { status: 400 });
    }

    const result = await executeAutonomousTrade({
      ticker,
      side,
      conviction,
      rationale,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Execution failed' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      order_id: result.orderId,
      ticker: ticker.toUpperCase(),
      shares: result.shares,
      price: result.price,
      side,
    });
  } catch (error) {
    console.error('Trade execute error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
