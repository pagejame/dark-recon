import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticker, position_type, thesis, signal_source, entry_notes } = body;

    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json({ error: 'Ticker required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('trade_journal')
      .insert({
        ticker: ticker.toUpperCase(),
        position_type,
        thesis,
        signal_source,
        entry_notes,
      })
      .select()
      .single();

    if (error) {
      console.error('Journal insert error:', error);
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e) {
    console.error('Journal API error:', e);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
