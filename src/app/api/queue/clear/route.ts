import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function DELETE() {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('trade_queue')
      .delete()
      .in('status', ['pending', 'expired']);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: '✓ Trade queue cleared — ready for fresh start',
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
