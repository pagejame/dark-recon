import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkPriceAlerts } from '@/lib/agents/price-alerts';

export async function GET() {
  try {
    const supabase = await createClient();
    const result = await checkPriceAlerts(supabase);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Alert check error:', error);
    return NextResponse.json({ triggered: [], checked: 0 });
  }
}
