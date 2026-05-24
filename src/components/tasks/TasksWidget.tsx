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
}

export default function TasksWidget({ compact = false }: TasksWidgetProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [newPriority, setNewPriority] = useState(2);
  const [saving, setSaving] = useState(false);

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTasks();
  }, []);

  const completeTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
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

  function getTaskAction(task: Task): { label: string; action: () => void } | null {
    const title = task.title.toLowerCase();

    if (
      title.includes('alpaca') ||
      title.includes('limit order') ||
      title.includes('pending order') ||
      title.includes('cancel')
    ) {
      return { label: 'GO TO PORTFOLIO', action: () => { window.location.href = '/portfolio'; } };
    }
    if (
      title.includes('close all') ||
      title.includes('open position') ||
      title.includes('close position')
    ) {
      return { label: 'VIEW POSITIONS', action: () => { window.location.href = '/portfolio'; } };
    }
    if (
      title.includes('launch checklist') ||
      title.includes('run launch') ||
      title.includes('system check')
    ) {
      return { label: 'RUN CHECKLIST', action: () => { window.location.href = '/launch'; } };
    }
    if (title.includes('trade queue') || title.includes('approve') || title.includes('queue')) {
      return { label: 'OPEN QUEUE', action: () => { window.location.href = '/queue'; } };
    }
    if (title.includes('watchlist') || title.includes('recon feed') || title.includes('ticker')) {
      return { label: 'OPEN WATCHLIST', action: () => { window.location.href = '/recon'; } };
    }
    if (title.includes('strategy') || title.includes('decision log')) {
      return { label: 'OPEN STRATEGY', action: () => { window.location.href = '/strategy'; } };
    }
    if (title.includes('alert') || title.includes('price alert') || title.includes('stop loss')) {
      return { label: 'SET ALERTS', action: () => { window.location.href = '/alerts'; } };
    }
    if (title.includes('autopilot')) {
      return { label: 'RUN AUTOPILOT', action: () => { window.location.href = '/autopilot'; } };
    }
    if (title.includes('intelligence') || title.includes('sweep') || title.includes('reddit')) {
      return { label: 'OPEN INTEL', action: () => { window.location.href = '/intelligence'; } };
    }
    if (title.includes('congressional') || title.includes('smart money') || title.includes('pelosi')) {
      return { label: 'SMART MONEY', action: () => { window.location.href = '/smartmoney'; } };
    }
    if (title.includes('settings') || title.includes('enable') || title.includes('toggle')) {
      return { label: 'OPEN SETTINGS', action: () => { window.location.href = '/settings'; } };
    }
    if (title.includes('weekly email') || title.includes('email') || title.includes('resend')) {
      return { label: 'EMAIL SETTINGS', action: () => { window.location.href = '/settings'; } };
    }
    if (title.includes('journal') || title.includes('log') || title.includes('record')) {
      return { label: 'OPEN JOURNAL', action: () => { window.location.href = '/journal'; } };
    }
    if (title.includes('portfolio') || title.includes('position') || title.includes('holding')) {
      return { label: 'VIEW PORTFOLIO', action: () => { window.location.href = '/portfolio'; } };
    }
    if (title.includes('options') || title.includes('call') || title.includes('put')) {
      return { label: 'OPTIONS CHAIN', action: () => { window.location.href = '/options'; } };
    }
    if (title.includes('earnings')) {
      return { label: 'EARNINGS CALENDAR', action: () => { window.location.href = '/earnings'; } };
    }
    if (title.includes('thesis')) {
      return { label: 'THESIS BUILDER', action: () => { window.location.href = '/thesis'; } };
    }
    if (title.includes('signal') || title.includes('scanner')) {
      return { label: 'VIEW SIGNALS', action: () => { window.location.href = '/signals'; } };
    }
    if (
      title.includes('supabase') ||
      title.includes('database') ||
      title.includes('clear trade queue')
    ) {
      return { label: 'GO TO LAUNCH', action: () => { window.location.href = '/launch'; } };
    }
    if (title.includes('dashboard')) {
      return { label: 'DASHBOARD', action: () => { window.location.href = '/dashboard'; } };
    }

    if (task.category === 'trading') {
      return { label: 'VIEW SIGNALS', action: () => { window.location.href = '/signals'; } };
    }
    if (task.category === 'platform') {
      return { label: 'DASHBOARD', action: () => { window.location.href = '/dashboard'; } };
    }
    if (task.category === 'urgent') {
      return { label: 'GO TO PORTFOLIO', action: () => { window.location.href = '/portfolio'; } };
    }

    return null;
  }

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
                </div>
                {task.notes && !compact && (
                  <div style={{ fontSize: 12, color: '#7a8fa8', lineHeight: 1.5 }}>
                    {task.notes}
                  </div>
                )}
              </div>

              {(() => {
                const taskAction = getTaskAction(task);
                if (!taskAction) return null;
                return (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      taskAction.action();
                    }}
                    style={{
                      padding: '4px 10px',
                      background: `${catColor}15`,
                      border: `1px solid ${catColor}40`,
                      borderRadius: 6,
                      color: catColor,
                      fontFamily: 'monospace',
                      fontSize: 8,
                      letterSpacing: 1,
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      alignSelf: 'flex-start',
                      marginTop: 2,
                    }}
                  >
                    {taskAction.label} →
                  </button>
                );
              })()}

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
    </div>
  );
}
