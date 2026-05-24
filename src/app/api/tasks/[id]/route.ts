import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function generateFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/\$[\d,\.]+/g, 'PRICE')
    .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE')
    .replace(/\b(xle|meta|lly|nvda|gm|qqq|spy|aapl|msft|amzn|tsla|amd)\b/gi, 'TICKER')
    .replace(/\d+/g, 'NUM')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
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

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.status !== undefined) {
      updates.status = body.status;
      if (body.status === 'done') {
        updates.completed_at = new Date().toISOString();
      }
    }

    if (body.execution_result !== undefined) updates.execution_result = body.execution_result;
    if (body.execution_message !== undefined) updates.execution_message = body.execution_message;
    if (body.last_executed_at !== undefined) {
      updates.last_executed_at = body.last_executed_at;
    } else if (body.execution_result !== undefined) {
      updates.last_executed_at = new Date().toISOString();
    }

    if (body.action_type !== undefined) updates.action_type = body.action_type;
    if (body.action_endpoint !== undefined) updates.action_endpoint = body.action_endpoint;
    if (body.action_method !== undefined) updates.action_method = body.action_method;
    if (body.action_body !== undefined) updates.action_body = body.action_body;

    if (body.issue_fingerprint !== undefined) updates.issue_fingerprint = body.issue_fingerprint;

    const { error } = await supabase.from('tasks').update(updates).eq('id', id);

    if (error) {
      console.error('Task update error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (body.status === 'done') {
      const { error: logError } = await supabase.from('task_execution_log').insert({
        task_title: task.title,
        task_category: task.category || 'general',
        action_taken: body.action_endpoint || body.action_label || 'manual_complete',
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Update failed' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const { error } = await supabase.from('tasks').delete().eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    );
  }
}
