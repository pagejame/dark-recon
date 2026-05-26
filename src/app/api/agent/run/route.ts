import { NextResponse } from 'next/server';
import { runAutonomousAgent } from '@/lib/agents/autonomous';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 55;

export async function POST() {
  try {
    const startTime = Date.now();
    const result = await runAutonomousAgent();
    const duration = Date.now() - startTime;

    const supabase = createAdminClient();
    try {
      await supabase.from('cron_runs').insert({
        job_name: 'autonomous-agent',
        status: result.errors.length === 0 ? 'success' : 'partial',
        results: {
          executed: result.executed,
          queued: result.queued,
          notified: result.notified,
          skipped: result.skipped,
          decisions: result.decisions.map((d) => ({
            action: d.action,
            issue: d.issue,
            ticker: d.ticker,
            rationale: d.rationale,
            priority: d.priority,
            endpoint: d.endpoint,
          })),
          errors: result.errors,
          triggered_by: 'manual',
        },
        duration_ms: duration,
        ran_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Manual agent run cron log error:', e);
    }

    return NextResponse.json({
      success: true,
      executed: result.executed,
      queued: result.queued,
      notified: result.notified,
      skipped: result.skipped,
      decisions: result.decisions.length,
      duration_ms: duration,
    });
  } catch (error) {
    console.error('Manual agent run error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
