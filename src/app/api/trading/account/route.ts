import { NextResponse } from 'next/server';
import { getAccount } from '@/lib/api/alpaca';

export async function GET() {
  try {
    const account = await getAccount();
    return NextResponse.json(account);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get account';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
