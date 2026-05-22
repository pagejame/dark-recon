import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkPriceAlerts } from '@/lib/agents/price-alerts';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const result = await checkPriceAlerts(supabase);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Alert check error:', error);
    return NextResponse.json({ triggered: [], checked: 0 });
  }
}
