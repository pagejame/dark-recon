import { NextResponse } from 'next/server';
import { sendDailyPnLSummary } from '@/lib/services/daily-pnl';

export async function POST() {
  const result = await sendDailyPnLSummary();
  return NextResponse.json(result);
}
