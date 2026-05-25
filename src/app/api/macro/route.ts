import { NextResponse } from 'next/server';
import { getMacroSnapshot } from '@/lib/api/fred';

export async function GET() {
  try {
    const snapshot = await getMacroSnapshot();
    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json({ error: 'Macro data fetch failed' }, { status: 500 });
  }
}
