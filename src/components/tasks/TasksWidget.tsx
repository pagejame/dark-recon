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
  action_type?: string;
  action_endpoint?: string;
  action_method?: string;
  action_body?: Record<string, unknown>;
}

interface TaskAction {
  label: string;
  endpoint?: string;
  method?: string;
  body?: Record<string, unknown>;
  isNav: boolean;
  navUrl?: string;
  confirmText?: string;
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
  const [executingTask, setExecutingTask] = useState<string | null>(null);
  const [taskResults, setTaskResults] = useState<
    Record<string, { success: boolean; message: string }>
  >({});

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

  function inferAction(task: Task): TaskAction | null {
    const title = task.title.toLowerCase();
    const stored = task.action_type;
    const endpoint = task.action_endpoint;

    // --- STORED API ACTIONS (already execute correctly) ---
    if (stored === 'api' && endpoint) {
      const labels: Record<string, string> = {
        '/api/trading/orders/cancel-all': 'CANCEL ALL ORDERS',
        '/api/trading/positions/close-all': 'CLOSE ALL POSITIONS',
        '/api/queue/clear': 'CLEAR QUEUE',
        '/api/system/health': 'RUN HEALTH CHECK',
        '/api/email/test': 'SEND TEST EMAIL',
        '/api/autopilot?refresh=true': 'RUN AUTOPILOT',
        '/api/queue': 'BUILD QUEUE',
        '/api/settings': 'ENABLE NOW',
        '/api/intelligence?refresh=true': 'RUN SWEEP',
        '/api/smartmoney': 'REFRESH DATA',
        '/api/scan': 'RUN SCANNER',
      };
      return {
        label: labels[endpoint] || 'EXECUTE',
        endpoint,
        method: task.action_method || 'GET',
        body: task.action_body,
        isNav: false,
        confirmText: endpoint.includes('positions/close')
          ? 'This will close ALL open positions. Are you sure?'
          : endpoint.includes('orders/cancel')
            ? 'This will cancel ALL pending orders. Are you sure?'
            : undefined,
      };
    }

    if (stored === 'nav' && endpoint) {
      const labels: Record<string, string> = {
        '/queue': 'OPEN QUEUE →',
        '/recon': 'OPEN WATCHLIST →',
        '/strategy': 'OPEN STRATEGY →',
        '/alerts': 'SET ALERTS →',
        '/portfolio': 'VIEW PORTFOLIO →',
        '/signals': 'OPEN SIGNALS →',
      };
      return {
        label: labels[endpoint] || 'GO THERE →',
        isNav: true,
        navUrl: endpoint,
      };
    }

    // --- INTELLIGENCE / DATA REFRESH TASKS ---
    if (title.includes('reddit') || title.includes('intelligence') || title.includes('sweep')) {
      return {
        label: 'RUN SWEEP',
        endpoint: '/api/intelligence?refresh=true',
        method: 'GET',
        isNav: false,
      };
    }

    if (title.includes('congressional') || title.includes('smart money')) {
      return { label: 'REFRESH DATA', endpoint: '/api/smartmoney', method: 'GET', isNav: false };
    }

    // --- TRADE QUEUE TASKS ---
    if ((title.includes('review') && title.includes('queue')) || (title.includes('approve') && title.includes('trade'))) {
      return {
        label: 'BUILD QUEUE',
        endpoint: '/api/queue',
        method: 'POST',
        body: { action: 'build' },
        isNav: false,
      };
    }

    if (title.includes('trade queue') || title.includes('clear queue')) {
      return { label: 'CLEAR QUEUE', endpoint: '/api/queue/clear', method: 'DELETE', isNav: false };
    }

    // --- AUTOPILOT TASKS ---
    if (title.includes('autopilot') || title.includes('run autopilot')) {
      return {
        label: 'RUN AUTOPILOT',
        endpoint: '/api/autopilot?refresh=true',
        method: 'GET',
        isNav: false,
      };
    }

    // --- POSITION / ORDER TASKS ---
    if (title.includes('cancel') && (title.includes('order') || title.includes('alpaca'))) {
      return {
        label: 'CANCEL ALL ORDERS',
        endpoint: '/api/trading/orders/cancel-all',
        method: 'DELETE',
        isNav: false,
        confirmText: 'Cancel all pending Alpaca orders?',
      };
    }

    if (title.includes('close') && title.includes('position')) {
      return {
        label: 'CLOSE ALL POSITIONS',
        endpoint: '/api/trading/positions/close-all',
        method: 'DELETE',
        isNav: false,
        confirmText: 'Close ALL open positions and reset to cash?',
      };
    }

    // --- HEALTH / LAUNCH TASKS ---
    if (title.includes('launch') || title.includes('health check') || title.includes('checklist')) {
      return { label: 'RUN HEALTH CHECK', endpoint: '/api/system/health', method: 'GET', isNav: false };
    }

    // --- EMAIL TASKS ---
    if (title.includes('email') || title.includes('resend')) {
      return { label: 'SEND TEST EMAIL', endpoint: '/api/email/test', method: 'POST', isNav: false };
    }

    // --- SIGNAL / SCANNER TASKS ---
    if (title.includes('signal') || title.includes('scanner')) {
      return { label: 'RUN SCANNER', endpoint: '/api/scan', method: 'GET', isNav: false };
    }

    // --- SETTINGS TASKS (enable/toggle) ---
    if (
      title.includes('enable') ||
      title.includes('toggle') ||
      title.includes('auto-pop') ||
      title.includes('autopop')
    ) {
      return {
        label: 'ENABLE NOW',
        endpoint: '/api/settings',
        method: 'PATCH',
        body: { key: 'watchlist_autopop_enabled', value: { enabled: true } },
        isNav: false,
      };
    }

    // --- WATCHLIST TASK ---
    if (title.includes('watchlist') || title.includes('recon feed') || title.includes('tickers')) {
      return { label: 'OPEN WATCHLIST →', isNav: true, navUrl: '/recon' };
    }

    // --- STRATEGY / DECISION LOG ---
    if (title.includes('strategy') || title.includes('decision')) {
      return { label: 'OPEN STRATEGY →', isNav: true, navUrl: '/strategy' };
    }

    // --- PRICE ALERTS ---
    if (title.includes('alert') || title.includes('stop loss')) {
      return { label: 'SET ALERTS →', isNav: true, navUrl: '/alerts' };
    }

    // --- PORTFOLIO ---
    if (title.includes('portfolio') || title.includes('position') || title.includes('holding')) {
      return { label: 'VIEW PORTFOLIO →', isNav: true, navUrl: '/portfolio' };
    }

    // --- QUEUE (view) ---
    if (title.includes('queue')) {
      return { label: 'OPEN QUEUE →', isNav: true, navUrl: '/queue' };
    }

    // Category fallbacks
    if (task.category === 'urgent') {
      return {
        label: 'CANCEL ALL ORDERS',
        endpoint: '/api/trading/orders/cancel-all',
        method: 'DELETE',
        isNav: false,
      };
    }
    if (task.category === 'trading') {
      return { label: 'OPEN SIGNALS →', isNav: true, navUrl: '/signals' };
    }
    if (task.category === 'platform') {
      return { label: 'RUN HEALTH CHECK', endpoint: '/api/system/health', method: 'GET', isNav: false };
    }

    return null;
  }

  const executeTaskAction = async (task: Task) => {
    const action = inferAction(task);
    if (!action) return;

    // Handle navigation
    if (action.isNav && action.navUrl) {
      window.location.href = action.navUrl;
      return;
    }

    // Handle confirmation
    if (action.confirmText) {
      const confirmed = window.confirm(action.confirmText);
      if (!confirmed) return;
    }

    if (!action.endpoint) return;

    setExecutingTask(task.id);
    setTaskResults((prev) => ({ ...prev, [task.id]: { success: false, message: '' } }));

    try {
      const options: RequestInit = {
        method: action.method || 'GET',
        headers: { 'Content-Type': 'application/json' },
      };

      if (action.body && ['POST', 'PATCH', 'PUT'].includes(action.method || '')) {
        options.body = JSON.stringify(action.body);
      }

      const res = await fetch(action.endpoint, options);

      // Handle non-JSON responses
      const contentType = res.headers.get('content-type');
      let data: Record<string, unknown> = {};
      if (contentType?.includes('application/json')) {
        data = await res.json();
      } else {
        data = { success: res.ok, message: res.ok ? '✓ Done' : 'Request failed' };
      }

      const success = data.success !== false && !data.error && res.ok;
      const message =
        (data.message as string | undefined) ||
        (data.launch_message as string | undefined) ||
        (typeof data.queued === 'number' ? `✓ ${data.queued} trade(s) queued` : undefined) ||
        (data.overall_action ? `✓ Autopilot: ${data.overall_action}` : undefined) ||
        (success ? '✓ Completed successfully' : (data.error as string) || 'Something went wrong');

      setTaskResults((prev) => ({ ...prev, [task.id]: { success, message } }));

      // Auto-complete task on success after 2 seconds
      if (success) {
        setTimeout(() => {
          void completeTask(task.id);
        }, 2000);
      }
    } catch (e) {
      setTaskResults((prev) => ({
        ...prev,
        [task.id]: {
          success: false,
          message: e instanceof Error ? e.message : 'Failed to execute',
        },
      }));
    } finally {
      setExecutingTask(null);
    }
  };

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
                const action = inferAction(task);
                if (!action) return null;
                const isExecuting = executingTask === task.id;
                const result = taskResults[task.id];

                return (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      alignSelf: 'flex-start',
                      flexShrink: 0,
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void executeTaskAction(task);
                      }}
                      disabled={isExecuting}
                      style={{
                        padding: '5px 12px',
                        background: isExecuting ? '#1e2a3a' : action.isNav ? '#1e2a3a' : `${catColor}20`,
                        border: `1px solid ${isExecuting ? '#1e2a3a' : catColor}40`,
                        borderRadius: 6,
                        color: isExecuting ? '#7a8fa8' : catColor,
                        fontFamily: 'monospace',
                        fontSize: 8,
                        letterSpacing: 1,
                        fontWeight: 700,
                        cursor: isExecuting ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isExecuting
                        ? '⟳ RUNNING...'
                        : `${action.label}${!action.isNav ? ' ⚡' : ''}`}
                    </button>
                    {result && (
                      <div
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 8,
                          letterSpacing: 1,
                          color: result.success ? '#00ff88' : '#ff3d5a',
                          maxWidth: 140,
                          lineHeight: 1.3,
                        }}
                      >
                        {result.message}
                      </div>
                    )}
                  </div>
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
