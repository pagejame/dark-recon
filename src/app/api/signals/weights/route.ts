import { NextResponse } from 'next/server';
import { calculateSignalWeights } from '@/lib/services/signal-learning';

export async function GET() {
  try {
    const insights = await calculateSignalWeights();
    return NextResponse.json(insights);
  } catch (error) {
    console.error('Signal weights API error:', error);
    return NextResponse.json({ error: 'Signal weights calculation failed' });
  }
}
