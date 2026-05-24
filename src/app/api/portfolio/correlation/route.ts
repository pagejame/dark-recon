import { NextResponse } from 'next/server';
import { runCorrelationMonitor } from '@/lib/services/correlation';

export async function GET() {
  try {
    const alerts = await runCorrelationMonitor();
    return NextResponse.json({
      alerts,
      risk_level: alerts.some((a) => a.risk_level === 'high')
        ? 'high'
        : alerts.length > 0
          ? 'medium'
          : 'low',
    });
  } catch {
    return NextResponse.json({ alerts: [] });
  }
}
