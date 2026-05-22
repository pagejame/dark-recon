import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('price_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      console.error('Alerts GET error:', error);
      throw error;
    }
    return NextResponse.json({ alerts: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load alerts';
    return NextResponse.json({ alerts: [], error: message });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticker, condition, target_price, note } = body;

    if (!ticker || !condition || target_price === undefined || target_price === null) {
      return NextResponse.json(
        { error: 'ticker, condition, target_price required' },
        { status: 400 }
      );
    }

    const price = parseFloat(target_price);
    if (isNaN(price) || price <= 0) {
      return NextResponse.json({ error: 'Invalid target price' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('price_alerts')
      .insert({
        ticker: ticker.toUpperCase().trim(),
        condition,
        target_price: price,
        note: note || null,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      console.error('Alerts POST error:', error);
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create alert';
    console.error('Alerts POST catch:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
