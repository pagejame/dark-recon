import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { status } = await request.json();
    const supabase = await createClient();
    const { error } = await supabase.from('signals').update({ status }).eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Signal update error:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
