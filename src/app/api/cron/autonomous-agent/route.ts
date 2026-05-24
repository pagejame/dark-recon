import { NextRequest, NextResponse } from 'next/server';
import { runAutonomousAgent } from '@/lib/agents/autonomous';

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runAutonomousAgent();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Autonomous agent error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await runAutonomousAgent();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
