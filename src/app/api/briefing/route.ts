import { NextResponse } from 'next/server';
import { generateMorningBriefing, type MorningBriefing } from '@/lib/agents/briefing';
import { getTodaysBriefing } from '@/lib/db/briefings';

function mapDbBriefing(row: {
  date: string;
  market_status: string | null;
  sentiment: string | null;
  briefing_text: string;
  top_signals: unknown;
  key_levels: unknown;
  generated_at: string;
}): MorningBriefing {
  return {
    date: row.date,
    market_status: row.market_status || 'unknown',
    sentiment: (row.sentiment as MorningBriefing['sentiment']) || 'neutral',
    briefing_text: row.briefing_text,
    top_signals: (row.top_signals as string[]) || [],
    key_levels:
      (row.key_levels as MorningBriefing['key_levels']) || [],
    generated_at: row.generated_at,
  };
}

export async function GET() {
  try {
    const cached = await getTodaysBriefing();
    if (cached) {
      return NextResponse.json(mapDbBriefing(cached), {
        headers: { 'X-Cache': 'HIT' },
      });
    }

    const briefing = await generateMorningBriefing();
    return NextResponse.json(briefing, { headers: { 'X-Cache': 'MISS' } });
  } catch {
    return NextResponse.json({ error: 'Briefing agent failed' }, { status: 500 });
  }
}
