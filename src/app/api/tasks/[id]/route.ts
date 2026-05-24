import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = createAdminClient();

    const { data: task } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    const updates: Record<string, unknown> = {
      ...body,
      updated_at: new Date().toISOString(),
    };

    if (body.status === 'done') {
      updates.completed_at = new Date().toISOString();
    }

    if (body.execution_result) {
      updates.execution_result = body.execution_result;
      updates.execution_message = body.execution_message;
      updates.last_executed_at = new Date().toISOString();
    }

    const { error } = await supabase.from('tasks').update(updates).eq('id', id);
    if (error) throw error;

    if (body.status === 'done' && task) {
      const { error: logError } = await supabase.from('task_execution_log').insert({
        task_title: task.title,
        task_category: task.category,
        action_taken: body.action_endpoint || 'manual',
        action_label: body.action_label || 'COMPLETED',
        result: body.execution_result || 'success',
        result_message: body.execution_message || 'Task completed',
        issue_fingerprint: task.issue_fingerprint || generateFingerprint(task.title),
        executed_at: new Date().toISOString(),
      });
      if (logError) console.error(logError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Task update error:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    await supabase.from('tasks').delete().eq('id', id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
