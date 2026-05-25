import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const days = parseInt(request.nextUrl.searchParams.get('days') || '7');
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const { data } = await supabase
      .from('scanner_results')
      .select('*')
      .gte('scan_date', since)
      .order('conviction_score', { ascending: false })
      .limit(100);

    return NextResponse.json({ results: data || [] });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
