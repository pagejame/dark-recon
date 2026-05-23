// REQUIRED: Set CRON_SECRET in Vercel environment variables
// Generate with: openssl rand -hex 32
// Add to Vercel: Settings -> Environment Variables -> CRON_SECRET

import { NextRequest, NextResponse } from 'next/server';
import { generateMorningBriefing } from '@/lib/agents/briefing';
import { runMarketScan } from '@/lib/agents/scanner';
import { runAutopilot } from '@/lib/agents/autopilot';
import { saveBriefing } from '@/lib/db/briefings';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, string> = {};
  const startTime = Date.now();

  console.log('Dark Recon morning run starting...');

  const [briefingResult, scanResult, autopilotResult] = await Promise.allSettled([
    generateMorningBriefing(),
    runMarketScan(),
    runAutopilot(),
  ]);

  if (briefingResult.status === 'fulfilled') {
    try {
      const saved = await saveBriefing({
        date: briefingResult.value.date,
        market_status: briefingResult.value.market_status,
        sentiment: briefingResult.value.sentiment,
        briefing_text: briefingResult.value.briefing_text,
        top_signals: briefingResult.value.top_signals,
        key_levels: briefingResult.value.key_levels,
      });
      results.briefing = saved ? 'SUCCESS' : 'SAVE_FAILED';
    } catch {
      results.briefing = 'SAVE_FAILED';
    }
  } else {
    results.briefing = 'FAILED';
    console.error('Briefing failed:', briefingResult.reason);
  }

  if (scanResult.status === 'fulfilled') {
    try {
      const supabase = createAdminClient();
      for (const signal of scanResult.value) {
        await supabase.from('signals').insert({
          ticker: signal.ticker,
          signal_type: signal.signal_type,
          strength: signal.strength,
          summary: signal.summary,
          status: 'pending',
          scanned_at: signal.scanned_at,
        });
      }
      results.scanner = `SUCCESS — ${scanResult.value.length} signals`;
    } catch {
      results.scanner = 'SAVE_FAILED';
    }
  } else {
    results.scanner = 'FAILED';
    console.error('Scanner failed:', scanResult.reason);
  }

  if (autopilotResult.status === 'fulfilled') {
    try {
      const supabase = createAdminClient();
      const report = autopilotResult.value;
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
      results.autopilot = 'SUCCESS';
    } catch {
      results.autopilot = 'SAVE_FAILED';
    }
  } else {
    results.autopilot = 'FAILED';
    console.error('Autopilot failed:', autopilotResult.reason);
  }

  try {
    const supabase = createAdminClient();
    await supabase.from('cron_runs').insert({
      job_name: 'morning-run',
      status: Object.values(results).every((r) => r.includes('SUCCESS')) ? 'success' : 'partial',
      results,
      duration_ms: Date.now() - startTime,
      ran_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Failed to log cron run:', e);
  }

  console.log('Morning run complete:', results);
  return NextResponse.json({
    success: true,
    results,
    duration_ms: Date.now() - startTime,
  });
}
