import { NextRequest, NextResponse } from 'next/server';
import { buildThesis } from '@/lib/agents/thesis';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { ticker } = await request.json();
    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json({ error: 'Ticker required' }, { status: 400 });
    }

    const upperTicker = ticker.toUpperCase().trim();
    if (upperTicker.length > 5 || !/^[A-Z]+$/.test(upperTicker)) {
      return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 });
    }

    const thesis = await buildThesis(upperTicker);

    try {
      const supabase = await createClient();
      await supabase.from('theses').insert({
        ticker: thesis.ticker,
        company_name: thesis.company_name,
        conviction_score: thesis.conviction_score,
        overall_direction: thesis.overall_direction,
        thesis_data: thesis,
        generated_at: thesis.generated_at,
      });
    } catch (dbError) {
      console.error('Failed to save thesis:', dbError);
    }

    return NextResponse.json(thesis);
  } catch (e) {
    console.error('Thesis builder error:', e);
    return NextResponse.json({ error: 'Thesis generation failed' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
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
