import { NextResponse } from 'next/server';
import { runStopLossAudit } from '@/lib/services/stoploss-audit';

export async function GET() {
  try {
    const results = await runStopLossAudit();
    const allProtected = results.every((r) => r.has_stop);
    return NextResponse.json({
      results,
      all_protected: allProtected,
      checked: results.length,
    });
  } catch {
    return NextResponse.json({ results: [], error: 'Audit failed' });
  }
}
