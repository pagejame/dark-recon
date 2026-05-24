'use client';

import { useState, useEffect } from 'react';

interface Task {
  id: string;
  title: string;
  notes?: string;
  category: string;
  status: string;
  priority: number;
  due_date?: string;
  created_at: string;
  issue_fingerprint?: string;
  last_executed_at?: string;
  execution_result?: string;
  execution_message?: string;
}

interface ExecutionLogEntry {
  id: string;
  task_title: string;
  action_label: string;
  result: string;
  result_message?: string;
  issue_fingerprint?: string;
  executed_at: string;
}

function generateFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/\$[\d,\.]+/g, 'PRICE')
    .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE')
    .replace(/\b(xle|meta|lly|nvda|gm|qqq|spy|aapl|msft|amzn)\b/gi, 'TICKER')
    .replace(/\d+/g, 'NUM')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

const CATEGORY_COLORS: Record<string, string> = {
  urgent: '#ff3d5a',
  platform: '#3d9aff',
  trading: '#00ff88',
  research: '#ffd700',
  general: '#7a8fa8',
};

interface TasksWidgetProps {
  compact?: boolean;
  onScanComplete?: (count: number) => void;
  onTasksLoaded?: (tasks: Task[]) => void;
  executeAllTrigger?: number;
}

export default function TasksWidget({
  compact = false,
  onTasksLoaded,
  executeAllTrigger,
}: TasksWidgetProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [newPriority, setNewPriority] = useState(2);
  const [saving, setSaving] = useState(false);
  const [executingTask, setExecutingTask] = useState<string | null>(null);
  const [taskResults, setTaskResults] = useState<
    Record<string, { success: boolean; message: string }>
  >({});
  const [executionLog, setExecutionLog] = useState<ExecutionLogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);

  const fetchTasksAndNotify = async () => {
    try {
      const [tasksRes, logRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/tasks/log'),
      ]);
      const data = await tasksRes.json();
      const logData = await logRes.json();
      const loadedTasks = data.tasks || [];
      setTasks(loadedTasks);
      setExecutionLog((logData.log || []).slice(0, 20));
      if (onTasksLoaded) onTasksLoaded(loadedTasks);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTasksAndNotify();
  }, []);

  const completeTask = async (
    id: string,
    meta?: {
      action_endpoint?: string;
      action_label?: string;
      execution_result?: string;
      execution_message?: string;
    }
  ) => {
    const task = tasks.find((t) => t.id === id);
    setTasks((prev) => prev.filter((t) => t.id !== id));

    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done', ...meta }),
    });

    if (task && !meta?.execution_result) {
      fetch('/api/tasks/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_title: task.title,
          task_category: task.category,
          action_taken: 'manual_complete',
          action_label: 'MARKED DONE',
          result: 'success',
          result_message: 'Task manually marked as complete',
          issue_fingerprint: generateFingerprint(task.title),
        }),
      }).catch(console.error);
    }
  };

  const deleteTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  };

  const addTask = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          notes: newNotes.trim() || null,
          category: newCategory,
          priority: newPriority,
        }),
      });
      const task = await res.json();
      if (task.id) {
        setTasks((prev) => [task, ...prev].sort((a, b) => a.priority - b.priority));
        setNewTitle('');
        setNewNotes('');
        setNewCategory('general');
        setNewPriority(2);
        setShowAdd(false);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const urgentTasks = tasks.filter((t) => t.category === 'urgent' || t.priority === 1);
  const otherTasks = tasks.filter((t) => t.category !== 'urgent' && t.priority !== 1);
  const displayTasks = compact ? tasks.slice(0, 5) : tasks;

  const executeTaskAction = async (task: Task) => {
    setExecutingTask(task.id);
    setTaskResults((prev) => ({
      ...prev,
      [task.id]: { success: false, message: '⟳ Analyzing...' },
    }));

    try {
      const planRes = await fetch('/api/tasks/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: task.title, notes: task.notes }),
      });

      const planData = await planRes.json();
      if (!planRes.ok || planData.error || !planData.action) {
        setTaskResults((prev) => ({
          ...prev,
          [task.id]: {
            success: false,
            message: planData.error || 'Could not determine action',
          },
        }));
        setExecutingTask(null);
        return;
      }

      const action = planData.action;

      if (action.action_type === 'nav') {
        const navUrl =
          action.endpoint && action.endpoint !== 'null' && action.endpoint !== null
            ? action.endpoint
            : '/dashboard';
        setTaskResults((prev) => ({
          ...prev,
          [task.id]: { success: true, message: `→ Opening ${navUrl}...` },
        }));
        setExecutingTask(null);
        setTimeout(() => {
          window.location.href = navUrl;
        }, 600);
        return;
      }

      if (action.action_type === 'manual') {
        setTaskResults((prev) => ({
          ...prev,
          [task.id]: { success: true, message: `ℹ️ ${action.explanation}` },
        }));
        setExecutingTask(null);
        return;
      }

      if (action.requires_confirmation) {
        const confirmed = window.confirm(action.confirmation_message || 'Are you sure?');
        if (!confirmed) {
          setTaskResults((prev) => ({
            ...prev,
            [task.id]: { success: false, message: 'Cancelled' },
          }));
          setExecutingTask(null);
          return;
        }
      }

      setTaskResults((prev) => ({
        ...prev,
        [task.id]: { success: false, message: `⟳ ${action.label}...` },
      }));

      const execOptions: RequestInit = {
        method: action.method || 'GET',
        headers: { 'Content-Type': 'application/json' },
      };

      if (action.body && ['POST', 'PATCH', 'PUT'].includes(action.method || '')) {
        execOptions.body = JSON.stringify(action.body);
      }

      const execRes = await fetch(action.endpoint, execOptions);
      let execData: Record<string, unknown> = {};

      try {
        const text = await execRes.text();
        if (text) execData = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // non-JSON response is ok
      }

      const success = execRes.ok && execData.success !== false && !execData.error;
      const resultMsg =
        (execData.message as string | undefined) ||
        (execData.launch_message as string | undefined) ||
        (success ? `✓ ${action.explanation}` : (execData.error as string) || `Failed (${execRes.status})`);

      setTaskResults((prev) => ({ ...prev, [task.id]: { success, message: resultMsg } }));

      if (success) {
        fetch('/api/tasks/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_title: task.title,
            task_category: task.category,
            action_taken: action.endpoint || 'manual',
            action_label: action.label || 'EXECUTED',
            result: 'success',
            result_message: resultMsg || 'Task completed successfully',
            issue_fingerprint: generateFingerprint(task.title),
          }),
        }).catch(console.error);

        void fetch(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            execution_result: 'success',
            execution_message: resultMsg,
            action_endpoint: action.endpoint,
            action_label: action.label,
          }),
        }).catch(console.error);

        setTimeout(() => {
          void completeTask(task.id, {
            action_endpoint: action.endpoint,
            action_label: action.label,
            execution_result: 'success',
            execution_message: resultMsg,
          });
        }, 2000);
      }
    } catch (e) {
      setTaskResults((prev) => ({
        ...prev,
        [task.id]: {
          success: false,
          message: e instanceof Error ? e.message : 'Failed',
        },
      }));
    } finally {
      setExecutingTask(null);
    }
  };

  const executeAll = async (tasksToRun: Task[]) => {
    const pending = tasksToRun.filter((t) => t.status === 'pending');
    if (pending.length === 0) return;

    for (const task of pending) {
      if (taskResults[task.id]?.success) continue;
      await executeTaskAction(task);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  };

  useEffect(() => {
    if (executeAllTrigger && executeAllTrigger > 0 && tasks.length > 0) {
      void executeAll(tasks);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executeAllTrigger]);

  if (loading) {
    return (
      <div
        style={{
          padding: 16,
          color: '#3d5068',
          fontFamily: 'monospace',
          fontSize: 10,
          letterSpacing: 2,
        }}
      >
        LOADING TASKS...
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 3, color: '#ffd700' }}>
            TO-DO
          </div>
          {tasks.length > 0 && (
            <span
              style={{
                background: urgentTasks.length > 0 ? '#ff3d5a20' : '#1e2a3a',
                border: `1px solid ${urgentTasks.length > 0 ? '#ff3d5a40' : '#1e2a3a'}`,
                color: urgentTasks.length > 0 ? '#ff3d5a' : '#7a8fa8',
                fontFamily: 'monospace',
                fontSize: 9,
                padding: '2px 8px',
                borderRadius: 20,
              }}
            >
              {tasks.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!compact && (
            <button
              onClick={() => setShowAdd(!showAdd)}
              style={{
                padding: '5px 14px',
                background: '#00ff8815',
                border: '1px solid #00ff8840',
                borderRadius: 8,
                color: '#00ff88',
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 1,
                cursor: 'pointer',
              }}
            >
              + ADD TASK
            </button>
          )}
          {compact && (
            <a
              href="/tasks"
              style={{
                fontFamily: 'monospace',
                fontSize: 9,
                color: '#7a8fa8',
                letterSpacing: 1,
                textDecoration: 'none',
              }}
            >
              VIEW ALL →
            </a>
          )}
        </div>
      </div>

      {showAdd && !compact && (
        <div
          style={{
            background: '#0d1117',
            border: '1px solid #1e2a3a',
            borderRadius: 10,
            padding: 16,
            marginBottom: 14,
          }}
        >
          <input
            type="text"
            placeholder="Task title..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void addTask()}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: '#111620',
              border: '1px solid #1e2a3a',
              borderRadius: 8,
              color: '#e8edf5',
              fontFamily: 'inherit',
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: 8,
            }}
          />
          <textarea
            placeholder="Notes (optional)..."
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            rows={2}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: '#111620',
              border: '1px solid #1e2a3a',
              borderRadius: 8,
              color: '#e8edf5',
              fontFamily: 'inherit',
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: 8,
              resize: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 10px',
                background: '#111620',
                border: '1px solid #1e2a3a',
                borderRadius: 8,
                color: '#e8edf5',
                fontFamily: 'monospace',
                fontSize: 10,
                outline: 'none',
              }}
            >
              {Object.keys(CATEGORY_COLORS).map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(parseInt(e.target.value, 10))}
              style={{
                flex: 1,
                padding: '8px 10px',
                background: '#111620',
                border: '1px solid #1e2a3a',
                borderRadius: 8,
                color: '#e8edf5',
                fontFamily: 'monospace',
                fontSize: 10,
                outline: 'none',
              }}
            >
              <option value={1}>HIGH PRIORITY</option>
              <option value={2}>MED PRIORITY</option>
              <option value={3}>LOW PRIORITY</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowAdd(false)}
              style={{
                flex: 1,
                padding: 10,
                background: 'transparent',
                border: '1px solid #1e2a3a',
                borderRadius: 8,
                color: '#7a8fa8',
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 1,
                cursor: 'pointer',
              }}
            >
              CANCEL
            </button>
            <button
              onClick={() => void addTask()}
              disabled={saving || !newTitle.trim()}
              style={{
                flex: 2,
                padding: 10,
                background: !newTitle.trim() ? '#1e2a3a' : '#00ff88',
                color: !newTitle.trim() ? '#7a8fa8' : '#080a0f',
                border: 'none',
                borderRadius: 8,
                fontFamily: 'monospace',
                fontSize: 10,
                letterSpacing: 1,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {saving ? 'SAVING...' : 'ADD TASK'}
            </button>
          </div>
        </div>
      )}

      {tasks.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: 24,
            color: '#3d5068',
            fontFamily: 'monospace',
            fontSize: 10,
            letterSpacing: 2,
          }}
        >
          ALL CAUGHT UP ✓
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(compact ? displayTasks : [...urgentTasks, ...otherTasks]).map((task) => {
          const catColor = CATEGORY_COLORS[task.category] || '#7a8fa8';
          const taskFingerprint = task.issue_fingerprint || generateFingerprint(task.title);
          const handledEntry = executionLog.find(
            (log) =>
              log.result === 'success' &&
              (log.issue_fingerprint === taskFingerprint ||
                log.task_title.toLowerCase() === task.title.toLowerCase())
          );

          return (
            <div
              key={task.id}
              style={{
                background: '#0d1117',
                border: `1px solid ${task.priority === 1 ? '#ff3d5a20' : '#1e2a3a'}`,
                borderLeft: `3px solid ${catColor}`,
                borderRadius: 8,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}
            >
              <button
                onClick={() => void completeTask(task.id)}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  flexShrink: 0,
                  border: `1px solid ${catColor}40`,
                  background: 'transparent',
                  cursor: 'pointer',
                  marginTop: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Mark complete"
              >
                <span style={{ fontSize: 10, color: catColor }}>✓</span>
              </button>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: task.notes ? 4 : 0,
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontSize: 13, color: '#e8edf5', fontWeight: 500 }}>
                    {task.title}
                  </span>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 7,
                      letterSpacing: 1,
                      color: catColor,
                      background: `${catColor}15`,
                      border: `1px solid ${catColor}30`,
                      padding: '1px 6px',
                      borderRadius: 10,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {task.category.toUpperCase()}
                  </span>
                  {task.priority === 1 && (
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 7,
                        letterSpacing: 1,
                        color: '#ff3d5a',
                        background: '#ff3d5a15',
                        border: '1px solid #ff3d5a30',
                        padding: '1px 6px',
                        borderRadius: 10,
                      }}
                    >
                      URGENT
                    </span>
                  )}
                  {handledEntry && (
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 7,
                        letterSpacing: 1,
                        color: '#3d9aff',
                        background: '#3d9aff15',
                        border: '1px solid #3d9aff30',
                        padding: '1px 6px',
                        borderRadius: 10,
                        whiteSpace: 'nowrap',
                      }}
                      title={handledEntry.result_message || handledEntry.action_label}
                    >
                      ALREADY HANDLED · {new Date(handledEntry.executed_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {task.notes && !compact && (
                  <div style={{ fontSize: 12, color: '#7a8fa8', lineHeight: 1.5 }}>
                    {task.notes}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignSelf: 'flex-start',
                  flexShrink: 0,
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void executeTaskAction(task);
                  }}
                  disabled={executingTask === task.id}
                  style={{
                    padding: '5px 12px',
                    background:
                      executingTask === task.id ? '#1e2a3a' : `${catColor}20`,
                    border: `1px solid ${executingTask === task.id ? '#1e2a3a' : `${catColor}40`}`,
                    borderRadius: 6,
                    color: executingTask === task.id ? '#7a8fa8' : catColor,
                    fontFamily: 'monospace',
                    fontSize: 8,
                    letterSpacing: 1,
                    fontWeight: 700,
                    cursor: executingTask === task.id ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {executingTask === task.id ? '⟳' : '⚡ EXECUTE'}
                </button>
                {taskResults[task.id] && (
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 8,
                      letterSpacing: 1,
                      color: taskResults[task.id].success
                        ? '#00ff88'
                        : taskResults[task.id].message.startsWith('⟳')
                          ? '#ffd700'
                          : '#ff3d5a',
                      marginTop: 4,
                      maxWidth: 160,
                      lineHeight: 1.4,
                    }}
                  >
                    {taskResults[task.id].message}
                  </div>
                )}
              </div>

              {!compact && (
                <button
                  onClick={() => void deleteTask(task.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#3d5068',
                    cursor: 'pointer',
                    fontSize: 14,
                    padding: '0 4px',
                    flexShrink: 0,
                  }}
                  title="Delete task"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      {compact && tasks.length > 5 && (
        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <a
            href="/tasks"
            style={{
              fontFamily: 'monospace',
              fontSize: 9,
              color: '#3d5068',
              letterSpacing: 1,
              textDecoration: 'none',
            }}
          >
            +{tasks.length - 5} more tasks →
          </a>
        </div>
      )}

      {!compact && executionLog.length > 0 && (
        <div style={{ marginTop: 20, borderTop: '1px solid #1e2a3a', paddingTop: 16 }}>
          <button
            onClick={() => setShowLog(!showLog)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 2,
              color: '#3d5068',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {showLog ? '▼' : '▶'} EXECUTION HISTORY ({executionLog.length})
          </button>

          {showLog && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {executionLog.map((log) => (
                <div
                  key={log.id}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    padding: '6px 10px',
                    background: '#0d1117',
                    border: '1px solid #1e2a3a',
                    borderLeft: `2px solid ${log.result === 'success' ? '#00ff8840' : '#ff3d5a40'}`,
                    borderRadius: 6,
                    opacity: 0.7,
                  }}
                >
                  <span
                    style={{
                      color: log.result === 'success' ? '#00ff88' : '#ff3d5a',
                      fontSize: 10,
                      flexShrink: 0,
                    }}
                  >
                    {log.result === 'success' ? '✓' : '✗'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 11,
                        color: '#7a8fa8',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {log.task_title}
                    </div>
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 8,
                        color: '#3d5068',
                        marginTop: 2,
                      }}
                    >
                      {log.action_label} · {new Date(log.executed_at).toLocaleDateString()}{' '}
                      {new Date(log.executed_at).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
