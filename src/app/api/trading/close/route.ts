import { NextRequest, NextResponse } from 'next/server';
import { closePosition } from '@/lib/api/alpaca';

export async function POST(request: NextRequest) {
  try {
    const { symbol } = await request.json();
    if (!symbol) return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
    const result = await closePosition(String(symbol).toUpperCase());
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Close failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
