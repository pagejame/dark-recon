import { NextResponse } from 'next/server';
import { runPositionMonitor } from '@/lib/agents/position-monitor';

export async function GET() {
  try {
    const result = await runPositionMonitor();
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Monitor failed', alerts: [] });
  }
}
