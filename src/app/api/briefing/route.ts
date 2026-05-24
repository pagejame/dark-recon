import { NextRequest, NextResponse } from 'next/server';
import { generateMorningBriefing } from '@/lib/agents/briefing';
import { getTodaysBriefing, saveBriefing, mapDbBriefingToResponse } from '@/lib/db/briefings';

export async function GET(request: NextRequest) {
  try {
    const refresh = request.nextUrl.searchParams.get('refresh') === 'true';

    if (!refresh) {
      const cached = await getTodaysBriefing();
      if (cached) {
        return NextResponse.json({ ...mapDbBriefingToResponse(cached), cache: 'HIT' });
      }
    }

    const briefing = await generateMorningBriefing();

    try {
      await saveBriefing({
        date: briefing.date,
        market_status: briefing.market_status,
        sentiment: briefing.sentiment,
        briefing_text: briefing.briefing_text,
        top_signals: briefing.top_signals,
        key_levels: briefing.key_levels,
        premarket_data: briefing.pre_market ?? null,
        limit_order_assessments: briefing.limit_order_assessments ?? [],
      });
    } catch (e) {
      console.error('Failed to save briefing:', e);
    }

    return NextResponse.json({ ...briefing, cache: 'MISS' });
  } catch (error) {
    console.error('Briefing route error:', error);
    const message = error instanceof Error ? error.message : 'Briefing failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
