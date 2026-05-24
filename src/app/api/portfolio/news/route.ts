import { NextResponse } from 'next/server';
import { scanPositionNews } from '@/lib/services/position-news';

export async function GET() {
  try {
    const alerts = await scanPositionNews();
    return NextResponse.json({ alerts, count: alerts.length });
  } catch {
    return NextResponse.json({ alerts: [] });
  }
}
