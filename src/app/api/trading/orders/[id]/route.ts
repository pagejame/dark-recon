import { NextRequest, NextResponse } from 'next/server';
import { cancelOrder } from '@/lib/api/alpaca';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await cancelOrder(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cancel failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
