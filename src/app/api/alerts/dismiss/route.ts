import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();

    let ticker: string | null = null;
    try {
      const body = await request.json();
      ticker = body.ticker || null;
    } catch {
      /* no body is fine */
    }

    let query = supabase
      .from('price_alerts')
      .update({ status: 'dismissed', updated_at: new Date().toISOString() })
      .eq('status', 'triggered');

    if (ticker) {
      query = query.eq('ticker', ticker.toUpperCase());
    }

    const { data, error } = await query.select('id');

    if (error) throw error;

    const dismissed = data?.length || 0;

    return NextResponse.json({
      success: true,
      dismissed,
      message: `✓ Dismissed ${dismissed} triggered alert${dismissed !== 1 ? 's' : ''}`,
    });
  } catch (error) {
    console.error('Alert dismiss error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Dismiss failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('price_alerts')
      .update({ status: 'dismissed', updated_at: new Date().toISOString() })
      .eq('status', 'triggered')
      .select('id');

    if (error) throw error;

    const dismissed = data?.length || 0;

    return NextResponse.json({
      success: true,
      dismissed,
      message: `✓ Dismissed ${dismissed} triggered alert${dismissed !== 1 ? 's' : ''}`,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Dismiss failed' },
      { status: 500 }
    );
  }
}
