import { NextRequest, NextResponse } from 'next/server';
import { logStrategyDecision } from '@/lib/services/strategy';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    await logStrategyDecision(body);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to log decision' }, { status: 500 });
  }
}
