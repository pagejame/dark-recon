import { NextRequest, NextResponse } from 'next/server';
import {
  generateWeeklyAuditReport,
  sendWeeklyAuditEmail,
  saveWeeklyAuditReport,
} from '@/lib/services/weekly-audit';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();

    const report = await generateWeeklyAuditReport();
    const reportId = await saveWeeklyAuditReport(report);
    await sendWeeklyAuditEmail(report);

    await supabase.from('cron_runs').insert({
      job_name: 'weekly-audit',
      status: 'success',
      results: {
        report_id: reportId,
        week_pnl: report.performance.week_pnl,
        trades: report.trades.total_executed,
        win_rate: report.trades.win_rate,
        recommendations_count: report.recommendations.length,
      },
      ran_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      report_id: reportId,
      week_pnl: report.performance.week_pnl,
      win_rate: report.trades.win_rate,
      recommendations: report.recommendations,
    });
  } catch (error) {
    console.error('Weekly audit error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const report = await generateWeeklyAuditReport();
    const reportId = await saveWeeklyAuditReport(report);
    await sendWeeklyAuditEmail(report);
    return NextResponse.json({ success: true, report_id: reportId, report });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
