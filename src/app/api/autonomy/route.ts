import { NextRequest, NextResponse } from 'next/server';
import { getAutonomyConfig, enableFullAutonomy, disableFullAutonomy } from '@/lib/services/autonomy';

export async function GET() {
  try {
    const config = await getAutonomyConfig();
    return NextResponse.json(config);
  } catch {
    return NextResponse.json({ enabled: false });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, days } = await request.json();
    if (action === 'enable') {
      await enableFullAutonomy(days || 30);
      return NextResponse.json({
        success: true,
        message: `Full autonomy enabled for ${days || 30} days`,
      });
    }
    if (action === 'disable') {
      await disableFullAutonomy();
      return NextResponse.json({ success: true, message: 'Full autonomy disabled' });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
