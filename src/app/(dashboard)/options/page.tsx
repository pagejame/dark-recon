'use client';

import { useState } from 'react';
import OptionsChain from '@/components/options/OptionsChain';

export default function OptionsPage() {
  const [ticker, setTicker] = useState('');
  const [activeTicker, setActiveTicker] = useState('');
  const [optionType, setOptionType] = useState<'call' | 'put'>('call');

  const handleSearch = () => {
    const t = ticker.trim().toUpperCase();
    if (t) setActiveTicker(t);
  };

  return (
    <div className="dr-page">
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
          Options Chain
        </h1>
        <div style={{ fontSize: 13, color: '#7a8fa8', marginTop: 4 }}>
          Live strikes, greeks, IV — execute directly from Dark Recon
        </div>
      </div>

      <div
        style={{
          background: '#111620',
          border: '1px solid #1e2a3a',
          borderRadius: 10,
          padding: '16px 20px',
          marginBottom: 20,
          display: 'flex',
          gap: 10,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 140 }}>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 8,
              letterSpacing: 2,
              color: '#7a8fa8',
              marginBottom: 6,
            }}
          >
            TICKER
          </div>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="NVDA"
            style={{
              width: '100%',
              padding: '10px 14px',
              background: '#0d1117',
              border: '1px solid #1e2a3a',
              borderRadius: 8,
              color: '#e8edf5',
              fontFamily: 'monospace',
              fontSize: 16,
              letterSpacing: 3,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 8,
              letterSpacing: 2,
              color: '#7a8fa8',
              marginBottom: 6,
            }}
          >
            TYPE
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['call', 'put'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setOptionType(t)}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: `1px solid ${optionType === t ? (t === 'call' ? '#00ff88' : '#ff3d5a') : '#1e2a3a'}`,
                  background:
                    optionType === t ? (t === 'call' ? '#00ff8815' : '#ff3d5a15') : '#0d1117',
                  color: optionType === t ? (t === 'call' ? '#00ff88' : '#ff3d5a') : '#7a8fa8',
                  fontFamily: 'monospace',
                  fontSize: 9,
                  letterSpacing: 1,
                  cursor: 'pointer',
                }}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={handleSearch}
          disabled={!ticker.trim()}
          style={{
            padding: '10px 24px',
            background: !ticker.trim() ? '#1e2a3a' : '#00ff88',
            color: !ticker.trim() ? '#7a8fa8' : '#080a0f',
            border: 'none',
            borderRadius: 8,
            fontFamily: 'monospace',
            fontSize: 10,
            letterSpacing: 2,
            fontWeight: 700,
            cursor: !ticker.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          LOAD CHAIN
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 8,
            letterSpacing: 2,
            color: '#7a8fa8',
            display: 'flex',
            alignItems: 'center',
            marginRight: 4,
          }}
        >
          QUICK:
        </div>
        {['NVDA', 'AMD', 'TSLA', 'META', 'AAPL', 'SPY', 'QQQ'].map((t) => (
          <button
            key={t}
            onClick={() => {
              setTicker(t);
              setActiveTicker(t);
            }}
            style={{
              padding: '4px 12px',
              borderRadius: 20,
              border: `1px solid ${activeTicker === t ? '#ffd700' : '#1e2a3a'}`,
              background: activeTicker === t ? '#ffd70015' : '#111620',
              color: activeTicker === t ? '#ffd700' : '#7a8fa8',
              fontFamily: 'monospace',
              fontSize: 9,
              letterSpacing: 1,
              cursor: 'pointer',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {activeTicker ? (
        <div
          style={{
            background: '#111620',
            border: '1px solid #1e2a3a',
            borderRadius: 10,
            padding: 20,
          }}
        >
          <OptionsChain ticker={activeTicker} suggestedType={optionType} />
        </div>
      ) : (
        <div
          style={{
            textAlign: 'center',
            padding: 60,
            color: '#7a8fa8',
            fontFamily: 'monospace',
            fontSize: 11,
            letterSpacing: 2,
          }}
        >
          ENTER A TICKER TO LOAD THE OPTIONS CHAIN
        </div>
      )}
    </div>
  );
}
