import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get('refresh') ?? searchParams.get('fresh');
  const redirectUrl = new URL('/api/scan/full', request.url);
  if (refresh) redirectUrl.searchParams.set('refresh', refresh);
  return NextResponse.redirect(redirectUrl);
}
