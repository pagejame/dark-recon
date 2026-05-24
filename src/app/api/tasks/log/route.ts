import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { audit } from '@/lib/services/audit';

function generateFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/\$[\d,\.]+/g, '$X')
    .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE')
    .replace(/\d+/g, 'N')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    const fingerprint = body.issue_fingerprint || generateFingerprint(body.task_title || '');

    const { error } = await supabase.from('task_execution_log').insert({
      task_title: body.task_title,
      task_category: body.task_category || 'general',
      action_taken: body.action_taken || 'unknown',
      action_label: body.action_label || 'EXECUTED',
      result: body.result || 'success',
      result_message: body.result_message || '',
      issue_fingerprint: fingerprint,
    });

    if (error) throw error;

    await audit.taskExecuted({
      taskTitle: body.task_title,
      actionLabel: body.action_label || 'EXECUTED',
      result: body.result || 'success',
      resultMessage: body.result_message || '',
    });

    return NextResponse.json({ success: true, fingerprint });
  } catch (error) {
    console.error('Task log error:', error);
    return NextResponse.json({ error: 'Log failed' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('task_execution_log')
      .select('*')
      .order('executed_at', { ascending: false })
      .limit(100);

    return NextResponse.json({ log: data || [] });
  } catch {
    return NextResponse.json({ log: [] });
  }
}
