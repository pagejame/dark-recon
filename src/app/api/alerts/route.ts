import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('price_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ alerts: data || [] });
  } catch {
    return NextResponse.json({ alerts: [], error: 'Failed to load alerts' });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { ticker, condition, target_price, note } = await request.json();
    if (!ticker || !condition || !target_price) {
      return NextResponse.json(
        { error: 'ticker, condition, target_price required' },
        { status: 400 }
      );
    }
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('price_alerts')
      .insert({
        ticker: ticker.toUpperCase(),
        condition,
        target_price: parseFloat(target_price),
        note,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create alert';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
