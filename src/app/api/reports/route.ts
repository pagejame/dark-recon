import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  generateWeeklyAuditReport,
  sendWeeklyAuditEmail,
  saveWeeklyAuditReport,
} from '@/lib/services/weekly-audit';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const id = request.nextUrl.searchParams.get('id');

    if (id) {
      const { data } = await supabase
        .from('weekly_audit_reports')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      return NextResponse.json({ report: data?.report_data || data });
    }

    const { data } = await supabase
      .from('weekly_audit_reports')
      .select(
        'id, week_start, week_end, claude_analysis, recommendations, performance_summary, generated_at'
      )
      .order('week_start', { ascending: false })
      .limit(20);

    return NextResponse.json({ reports: data || [] });
  } catch {
    return NextResponse.json({ reports: [] });
  }
}

export async function POST() {
  try {
    const report = await generateWeeklyAuditReport();
    const id = await saveWeeklyAuditReport(report);
    await sendWeeklyAuditEmail(report);
    return NextResponse.json({ success: true, id, report });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
