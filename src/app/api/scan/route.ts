import { NextResponse } from 'next/server';
import { runMarketScan } from '@/lib/agents/scanner';

export async function GET() {
  try {
    const signals = await runMarketScan();
    return NextResponse.json({ signals, scanned_at: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: 'Scanner failed' }, { status: 500 });
  }
}
