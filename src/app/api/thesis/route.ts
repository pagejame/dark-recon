import { NextRequest, NextResponse } from 'next/server';
import { buildThesis } from '@/lib/agents/thesis';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  let upperTicker = '';
  try {
    const body = await request.json();
    const ticker = body?.ticker;

    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json({ error: 'Ticker required' }, { status: 400 });
    }

    upperTicker = ticker.toUpperCase().trim();
    if (upperTicker.length > 5 || !/^[A-Z]+$/.test(upperTicker)) {
      return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 });
    }

    const thesis = await buildThesis(upperTicker);

    try {
      const supabase = createAdminClient();
      await supabase.from('theses').insert({
        ticker: thesis.ticker,
        company_name: thesis.company_name,
        conviction_score: thesis.conviction_score,
        overall_direction: thesis.overall_direction,
        thesis_data: thesis,
        generated_at: thesis.generated_at,
      });
    } catch (dbError) {
      console.error('DB save error (non-fatal):', dbError);
    }

    return NextResponse.json(thesis);
  } catch (error) {
    console.error('Thesis route error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        error: message,
        ticker: upperTicker,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('theses')
      .select('*')
      .order('generated_at', { ascending: false })
      .limit(20);
    return NextResponse.json({ theses: data || [] });
  } catch (e) {
    console.error('Get theses error:', e);
    return NextResponse.json({ theses: [] });
  }
}
