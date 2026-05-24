import { NextRequest, NextResponse } from 'next/server';
import { runAutopilot, type AutopilotReport } from '@/lib/agents/autopilot';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/services/audit';

let reportCache: { report: AutopilotReport; timestamp: number; date: string } | null = null;

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get('refresh') === 'true';
  const today = new Date().toDateString();

  if (!refresh && reportCache && reportCache.date === today) {
    return NextResponse.json({ ...reportCache.report, cache: 'MEMORY' });
  }

  if (!refresh) {
    try {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from('autopilot_reports')
        .select('*')
        .eq('date', today)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        reportCache = { report: data as AutopilotReport, timestamp: Date.now(), date: today };
        return NextResponse.json({ ...data, cache: 'DB' });
      }
    } catch {
      // Fall through to generation
    }
  }

  try {
    const report = await runAutopilot();

    try {
      const supabase = createAdminClient();
      await supabase.from('autopilot_reports').insert({
        date: report.date,
        market_sentiment: report.market_sentiment,
        overall_action: report.overall_action,
        report_text: report.report_text,
        action_items: report.action_items,
        positions_review: report.positions_review,
        top_opportunities: report.top_opportunities,
        risk_flags: report.risk_flags,
        generated_at: report.generated_at,
      });

      if (report.top_opportunities) {
        await audit.autopilotGenerated({
          date: report.date,
          stance: report.overall_action,
          actionItemCount: report.action_items?.length || 0,
          topOpportunities: (report.top_opportunities || [])
            .map((o) => o.ticker)
            .filter(Boolean),
          riskFlags: (report.risk_flags || []).map((r) => r.flag).slice(0, 3),
        });
      }
    } catch (e) {
      console.error('Failed to save autopilot report:', e);
    }

    reportCache = { report, timestamp: Date.now(), date: today };
    return NextResponse.json({ ...report, cache: 'FRESH' });
  } catch (error) {
    console.error('Autopilot error:', error);
    const message = error instanceof Error ? error.message : 'Autopilot failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
