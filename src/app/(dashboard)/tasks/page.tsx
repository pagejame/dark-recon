'use client';

import { useState } from 'react';
import TasksWidget from '@/components/tasks/TasksWidget';

export default function TasksPage() {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [scanKey, setScanKey] = useState(0);

  const runScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch('/api/tasks/scan', { method: 'POST' });
      const data = await res.json();
      setScanResult(data.message || `✓ ${data.created} tasks created`);
      if (data.created > 0) {
        setScanKey((prev) => prev + 1);
      }
    } catch {
      setScanResult('✗ Scan failed — try again');
    } finally {
      setScanning(false);
    }
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
          <button
            onClick={() => void runScan()}
            disabled={scanning}
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
              cursor: scanning ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {scanning ? '⟳ SCANNING...' : '⚡ SCAN SITE'}
          </button>
        </div>

        {scanResult && (
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
          </div>
        )}

        {!scanning && !scanResult && (
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
        <TasksWidget key={scanKey} compact={false} />
      </div>
    </div>
  );
}
