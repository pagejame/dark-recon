'use client';

import TasksWidget from '@/components/tasks/TasksWidget';

export default function TasksPage() {
  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: 3,
            color: '#00ff88',
            marginBottom: 6,
          }}
        >
          ◆ DARK RECON
        </div>
        <h1
          style={{
            fontFamily: 'Syne, sans-serif',
            fontSize: 24,
            fontWeight: 800,
            color: '#e8edf5',
            margin: 0,
          }}
        >
          Task List
        </h1>
        <div style={{ fontSize: 13, color: '#7a8fa8', marginTop: 4 }}>
          Everything you need to do on the platform — check this every time you log in
        </div>
      </div>
      <div
        style={{
          background: '#111620',
          border: '1px solid #1e2a3a',
          borderRadius: 12,
          padding: 20,
        }}
      >
        <TasksWidget compact={false} />
      </div>
    </div>
  );
}
