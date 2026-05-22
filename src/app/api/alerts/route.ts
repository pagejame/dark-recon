import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function supabaseHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: SERVICE_KEY || '',
    Authorization: `Bearer ${SERVICE_KEY || ''}`,
    Prefer: 'return=representation',
  };
}

export async function GET() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/price_alerts?order=created_at.desc&limit=50`,
      { headers: supabaseHeaders() }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error('Alerts GET failed:', res.status, err);
      return NextResponse.json({ alerts: [], error: err });
    }

    const data = await res.json();
    return NextResponse.json({ alerts: data || [] });
  } catch (error) {
    console.error('Alerts GET error:', error);
    return NextResponse.json({ alerts: [], error: String(error) });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticker, condition, target_price, note } = body;

    if (!ticker || !condition || target_price === undefined) {
      return NextResponse.json(
        { error: 'ticker, condition, target_price required' },
        { status: 400 }
      );
    }

    const price = parseFloat(String(target_price));
    if (isNaN(price) || price <= 0) {
      return NextResponse.json({ error: 'Invalid price' }, { status: 400 });
    }

    const payload = {
      ticker: ticker.toUpperCase().trim(),
      condition,
      target_price: price,
      note: note || null,
      status: 'active',
    };

    console.log('Creating alert:', payload);
    console.log('Supabase URL:', SUPABASE_URL);
    console.log('Has service key:', !!SERVICE_KEY);

    const res = await fetch(`${SUPABASE_URL}/rest/v1/price_alerts`, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    console.log('Supabase response status:', res.status);
    console.log('Supabase response body:', responseText);

    if (!res.ok) {
      return NextResponse.json({ error: responseText }, { status: 500 });
    }

    const data = responseText ? JSON.parse(responseText) : payload;
    return NextResponse.json(Array.isArray(data) ? data[0] : data);
  } catch (error) {
    console.error('Alerts POST error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
