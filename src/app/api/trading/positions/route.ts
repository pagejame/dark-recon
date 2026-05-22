import { NextResponse } from 'next/server';
import { getPositions } from '@/lib/api/alpaca';

export async function GET() {
  try {
    const positions = await getPositions();
    return NextResponse.json({ positions });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get positions';
    return NextResponse.json({ error: message, positions: [] }, { status: 500 });
  }
}
