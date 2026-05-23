import { NextRequest, NextResponse } from 'next/server';
import { generateAndSendWeeklyEmail } from '@/lib/services/weekly-email';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const recipient = typeof body.email === 'string' ? body.email : undefined;
    const result = await generateAndSendWeeklyEmail({ recipient, force: true });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Test email failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
