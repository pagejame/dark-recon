'use client';

import { useState, useCallback } from 'react';
import TasksWidget from '@/components/tasks/TasksWidget';

export default function TasksPage() {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [scanKey, setScanKey] = useState(0);
  const [showExecuteAll, setShowExecuteAll] = useState(false);
  const [executingAll, setExecutingAll] = useState(false);
  const [executeAllTrigger, setExecuteAllTrigger] = useState(0);
  const [allTasksDone, setAllTasksDone] = useState(false);
  const [loadedTasks, setLoadedTasks] = useState<{ id: string; status: string }[]>([]);

  const runScan = async () => {
    setScanning(true);
    setScanResult(null);
    setShowExecuteAll(false);
    setAllTasksDone(false);
    try {
      const res = await fetch('/api/tasks/scan', { method: 'POST' });
      const data = await res.json();
      setScanResult(data.message || `✓ ${data.created} tasks created`);
      if (data.created > 0) {
        setScanKey((prev) => prev + 1);
        setShowExecuteAll(true);
      }
    } catch {
      setScanResult('✗ Scan failed — try again');
    } finally {
      setScanning(false);
    }
  };

  const handleTasksLoaded = useCallback((tasks: { id: string; status: string }[]) => {
    setLoadedTasks(tasks);
    if (tasks.filter((t) => t.status === 'pending').length > 0) {
      setShowExecuteAll(true);
    }
  }, []);

  const runExecuteAll = async () => {
    setExecutingAll(true);
    setAllTasksDone(false);
    setExecuteAllTrigger((prev) => prev + 1);

    const taskCount = loadedTasks.filter((t) => t.status === 'pending').length;
    const estimatedTime = taskCount * 6000;

    setTimeout(() => {
      setExecutingAll(false);
      setAllTasksDone(true);
      setShowExecuteAll(false);
      setExecuteAllTrigger(0);
      setScanKey((prev) => prev + 1);
    }, estimatedTime);
  };

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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
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
              Everything you need to do — check this every time you log in
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => void runScan()}
              disabled={scanning || executingAll}
              style={{
                padding: '10px 20px',
                background: scanning ? '#1e2a3a' : '#ffd70015',
                border: `1px solid ${scanning ? '#1e2a3a' : '#ffd70040'}`,
                borderRadius: 8,
                color: scanning ? '#7a8fa8' : '#ffd700',
                fontFamily: 'monospace',
                fontSize: 10,
                letterSpacing: 2,
                fontWeight: 700,
                cursor: scanning || executingAll ? 'not-allowed' : 'pointer',
              }}
            >
              {scanning ? '⟳ SCANNING...' : '⚡ SCAN SITE'}
            </button>

            {showExecuteAll && !allTasksDone && (
              <button
                onClick={() => void runExecuteAll()}
                disabled={executingAll || scanning}
                style={{
                  padding: '10px 20px',
                  background: executingAll ? '#1e2a3a' : '#00ff88',
                  border: 'none',
                  borderRadius: 8,
                  color: executingAll ? '#7a8fa8' : '#080a0f',
                  fontFamily: 'monospace',
                  fontSize: 10,
                  letterSpacing: 2,
                  fontWeight: 700,
                  cursor: executingAll || scanning ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  animation: !executingAll ? 'pulse-green 2s infinite' : 'none',
                }}
              >
                {executingAll ? '⟳ EXECUTING...' : '▶ EXECUTE ALL'}
              </button>
            )}

            {allTasksDone && (
              <div
                style={{
                  padding: '10px 20px',
                  background: '#00ff8815',
                  border: '1px solid #00ff8840',
                  borderRadius: 8,
                  color: '#00ff88',
                  fontFamily: 'monospace',
                  fontSize: 10,
                  letterSpacing: 2,
                  fontWeight: 700,
                }}
              >
                ✓ ALL DONE
              </div>
            )}
          </div>
        </div>

        {executingAll && (
          <div
            style={{
              marginTop: 12,
              padding: '12px 16px',
              background: '#00ff8808',
              border: '1px solid #00ff8830',
              borderRadius: 8,
              fontFamily: 'monospace',
              fontSize: 10,
              color: '#00ff88',
              letterSpacing: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
            Executing tasks sequentially — confirmations will appear as needed. Do not close this
            page.
          </div>
        )}

        {scanResult && !executingAll && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 16px',
              background: scanResult.startsWith('✓') ? '#00ff8808' : '#ff3d5a08',
              border: `1px solid ${scanResult.startsWith('✓') ? '#00ff8830' : '#ff3d5a30'}`,
              borderRadius: 8,
              fontFamily: 'monospace',
              fontSize: 11,
              color: scanResult.startsWith('✓') ? '#00ff88' : '#ff3d5a',
              letterSpacing: 1,
            }}
          >
            {scanResult}
            {showExecuteAll && scanResult.startsWith('✓') && (
              <span style={{ color: '#ffd700', marginLeft: 12 }}>
                — Click ▶ EXECUTE ALL to run them all automatically
              </span>
            )}
          </div>
        )}

        {!scanning && !scanResult && !executingAll && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 16px',
              background: '#0d1117',
              border: '1px solid #1e2a3a',
              borderRadius: 8,
              fontFamily: 'monospace',
              fontSize: 9,
              color: '#3d5068',
              letterSpacing: 1,
              lineHeight: 1.8,
            }}
          >
            SCAN CHECKS: Portfolio · Orders · Stop Losses · Trade Queue · Price Alerts · Position
            Alerts · Cron Jobs · Autopilot Actions · High Conviction Signals
          </div>
        )}
      </div>

      <div
        style={{
          background: '#111620',
          border: '1px solid #1e2a3a',
          borderRadius: 12,
          padding: 20,
        }}
      >
        <TasksWidget
          key={scanKey}
          compact={false}
          onTasksLoaded={handleTasksLoaded}
          executeAllTrigger={executeAllTrigger}
        />
      </div>

      <style>{`
        @keyframes pulse-green {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0, 255, 136, 0.4); }
          50% { box-shadow: 0 0 0 8px rgba(0, 255, 136, 0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
