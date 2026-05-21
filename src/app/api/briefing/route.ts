import { NextResponse } from 'next/server';
import { generateMorningBriefing } from '@/lib/agents/briefing';

export async function GET() {
  try {
    const briefing = await generateMorningBriefing();
    return NextResponse.json(briefing);
  } catch {
    return NextResponse.json({ error: 'Briefing agent failed' }, { status: 500 });
  }
}
