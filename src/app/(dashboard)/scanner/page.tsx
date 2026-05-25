'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';

interface ScannerResult {
  ticker: string;
  company_name?: string;
  scan_type: string;
  signal_strength: number;
  signal_data: Record<string, unknown>;
  claude_thesis: string;
  conviction_score: number;
  added_to_watchlist: boolean;
}

interface ScanResponse {
  signals: ScannerResult[];
  total_scanned: number;
  scan_types: Record<string, number>;
  top_opportunities: ScannerResult[];
  auto_added: string[];
  scanned_at?: string;
  cached?: boolean;
}

interface DbResult {
  id: string;
  scan_date: string;
  scan_type: string;
  ticker: string;
  company_name?: string;
  signal_strength: number;
  signal_data: Record<string, unknown>;
  claude_thesis: string;
  conviction_score: number;
  added_to_watchlist: boolean;
  created_at: string;
}

type SortKey = 'conviction_score' | 'scan_date' | 'scan_type' | 'ticker';

const SCAN_TYPE_LABELS: Record<string, string> = {
  pre_market_gap: 'PRE-MARKET GAPS',
  social_trending: 'SOCIAL TRENDING',
  sec_news: 'SEC FILINGS',
  earnings_surprise: 'EARNINGS SURPRISES',
  unusual_volume: 'UNUSUAL VOLUME',
  multi_signal: 'MULTI SIGNAL',
};

function scanTypeLabel(type: string) {
  return SCAN_TYPE_LABELS[type] || type.replace(/_/g, ' ').toUpperCase();
}

function convictionColor(score: number) {
  if (score >= 8) return '#00ff88';
  if (score >= 7) return '#ffd700';
  return '#7a8fa8';
}

export default function MarketScannerPage() {
  const [scanData, setScanData] = useState<ScanResponse | null>(null);
  const [history, setHistory] = useState<DbResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('conviction_score');
  const [sortAsc, setSortAsc] = useState(false);
  const [watchlistTickers, setWatchlistTickers] = useState<Set<string>>(new Set());

  const fetchWatchlist = useCallback(async () => {
    try {
      const res = await fetch('/api/watchlist');
      const data = await res.json();
      setWatchlistTickers(
        new Set((data.watchlist || []).map((w: { ticker: string }) => w.ticker))
      );
    } catch {
      setWatchlistTickers(new Set());
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/scan/results?days=7');
      const data = await res.json();
      setHistory(data.results || []);
    } catch {
      setHistory([]);
    }
  }, []);

  const runScan = useCallback(async (refresh = false) => {
    setScanning(true);
    try {
      const res = await fetch(`/api/scan/full${refresh ? '?refresh=true' : ''}`);
      const data = await res.json();
      if (!data.error) {
        setScanData(data);
        await fetchHistory();
        await fetchWatchlist();
      }
    } finally {
      setScanning(false);
      setLoading(false);
    }
  }, [fetchHistory, fetchWatchlist]);

  useEffect(() => {
    void runScan(false);
  }, [runScan]);

  const addToWatchlist = async (ticker: string, notes?: string) => {
    await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, notes }),
    });
    setWatchlistTickers((prev) => new Set([...prev, ticker.toUpperCase()]));
  };

  const signals = scanData?.signals || [];
  const topOpportunities = scanData?.top_opportunities || signals.filter((s) => s.conviction_score >= 7);
  const totalSignalsFound = Object.values(scanData?.scan_types || {}).reduce((a, b) => a + b, 0);

  const tableRows = useMemo(() => {
    const rows: Array<ScannerResult & { scan_date?: string }> = [
      ...signals.map((s) => ({ ...s, scan_date: scanData?.scanned_at?.split('T')[0] })),
    ];
    if (rows.length === 0 && history.length > 0) {
      history.forEach((h) => {
        rows.push({
          ticker: h.ticker,
          company_name: h.company_name,
          scan_type: h.scan_type,
          signal_strength: Number(h.signal_strength),
          signal_data: h.signal_data || {},
          claude_thesis: h.claude_thesis || '',
          conviction_score: h.conviction_score || 0,
          added_to_watchlist: h.added_to_watchlist,
          scan_date: h.scan_date,
        });
      });
    }

    return [...rows].sort((a, b) => {
      const av = a[sortKey as keyof typeof a];
      const bv = b[sortKey as keyof typeof b];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortAsc ? av - bv : bv - av;
      }
      return sortAsc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [signals, history, scanData, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
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
              Market Scanner
            </h1>
            <div style={{ fontSize: 13, color: '#7a8fa8', marginTop: 4 }}>
              Scanning {scanData?.total_scanned || '—'} stocks across S&P 500 + NASDAQ 100 + social
              sentiment
            </div>
            {scanData?.scanned_at && (
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#3d5068', marginTop: 4 }}>
                LAST SCANNED: {new Date(scanData.scanned_at).toLocaleString()}
                {scanData.cached ? ' (cached)' : ''}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void runScan(true)}
            disabled={scanning}
            style={{
              padding: '10px 24px',
              background: scanning ? '#1e2a3a' : '#00ff88',
              color: scanning ? '#7a8fa8' : '#080a0f',
              border: 'none',
              borderRadius: 8,
              fontFamily: 'monospace',
              fontSize: 10,
              letterSpacing: 2,
              fontWeight: 700,
              cursor: scanning ? 'wait' : 'pointer',
            }}
          >
            {scanning ? 'SCANNING...' : 'RUN FULL SCAN'}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#7a8fa8', fontFamily: 'monospace' }}>
          LOADING SCANNER...
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 10,
              marginBottom: 20,
            }}
          >
            {[
              { label: 'STOCKS SCANNED', value: scanData?.total_scanned || 0, color: '#3d9aff' },
              { label: 'SIGNALS FOUND', value: totalSignalsFound, color: '#ffd700' },
              {
                label: 'TOP OPPORTUNITIES',
                value: topOpportunities.length,
                color: '#00ff88',
              },
              {
                label: 'AUTO-ADDED',
                value: scanData?.auto_added?.length || 0,
                color: '#9b5de5',
              },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  background: '#111620',
                  border: '1px solid #1e2a3a',
                  borderRadius: 8,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 8,
                    letterSpacing: 2,
                    color: '#7a8fa8',
                    marginBottom: 6,
                  }}
                >
                  {stat.label}
                </div>
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 22,
                    fontWeight: 700,
                    color: stat.color,
                  }}
                >
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {Object.keys(scanData?.scan_types || {}).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
              {Object.entries(scanData!.scan_types).map(([type, count]) => (
                <span
                  key={type}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 9,
                    letterSpacing: 1,
                    color: '#7a8fa8',
                    background: '#111620',
                    border: '1px solid #1e2a3a',
                    padding: '6px 12px',
                    borderRadius: 20,
                  }}
                >
                  {scanTypeLabel(type)} · {count}
                </span>
              ))}
            </div>
          )}

          {topOpportunities.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 8,
                  letterSpacing: 3,
                  color: '#00ff88',
                  marginBottom: 12,
                }}
              >
                TOP OPPORTUNITIES
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topOpportunities.map((item) => {
                  const onWatchlist =
                    item.added_to_watchlist || watchlistTickers.has(item.ticker.toUpperCase());
                  const changePct = item.signal_data?.change_pct as number | undefined;
                  const volumeRatio = item.signal_data?.volume_ratio as number | undefined;

                  return (
                    <div
                      key={item.ticker}
                      style={{
                        background: '#111620',
                        border: '1px solid #1e2a3a',
                        borderLeft: `3px solid ${convictionColor(item.conviction_score)}`,
                        borderRadius: 10,
                        padding: '16px 18px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          flexWrap: 'wrap',
                          gap: 10,
                          marginBottom: 10,
                        }}
                      >
                        <div>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: 16,
                              fontWeight: 700,
                              color: '#ffd700',
                              marginRight: 8,
                            }}
                          >
                            {item.ticker}
                          </span>
                          {item.company_name && (
                            <span style={{ fontSize: 12, color: '#7a8fa8' }}>
                              {item.company_name}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: 9,
                              color: convictionColor(item.conviction_score),
                              background: `${convictionColor(item.conviction_score)}15`,
                              border: `1px solid ${convictionColor(item.conviction_score)}40`,
                              padding: '4px 10px',
                              borderRadius: 20,
                            }}
                          >
                            CONVICTION {item.conviction_score}/10
                          </span>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: 9,
                              color: '#3d9aff',
                              background: '#3d9aff15',
                              border: '1px solid #3d9aff40',
                              padding: '4px 10px',
                              borderRadius: 20,
                            }}
                          >
                            {scanTypeLabel(item.scan_type)}
                          </span>
                        </div>
                      </div>

                      <div style={{ fontSize: 13, color: '#e8edf5', lineHeight: 1.7, marginBottom: 10 }}>
                        {item.claude_thesis}
                      </div>

                      {(changePct !== undefined || volumeRatio !== undefined) && (
                        <div
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 10,
                            color: '#7a8fa8',
                            marginBottom: 12,
                          }}
                        >
                          {changePct !== undefined && (
                            <span style={{ marginRight: 16 }}>
                              Change: {changePct >= 0 ? '+' : ''}
                              {changePct.toFixed(2)}%
                            </span>
                          )}
                          {volumeRatio !== undefined && (
                            <span>Volume: {volumeRatio.toFixed(1)}x avg</span>
                          )}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <Link
                          href={`/thesis?ticker=${item.ticker}`}
                          style={{
                            padding: '8px 16px',
                            background: '#9b5de515',
                            border: '1px solid #9b5de540',
                            borderRadius: 8,
                            color: '#9b5de5',
                            fontFamily: 'monospace',
                            fontSize: 9,
                            letterSpacing: 1,
                            textDecoration: 'none',
                          }}
                        >
                          ANALYZE →
                        </Link>
                        {!onWatchlist && (
                          <button
                            type="button"
                            onClick={() =>
                              void addToWatchlist(
                                item.ticker,
                                `Added from market scanner: ${item.claude_thesis}`
                              )
                            }
                            style={{
                              padding: '8px 16px',
                              background: '#3d9aff15',
                              border: '1px solid #3d9aff40',
                              borderRadius: 8,
                              color: '#3d9aff',
                              fontFamily: 'monospace',
                              fontSize: 9,
                              letterSpacing: 1,
                              cursor: 'pointer',
                            }}
                          >
                            ADD TO WATCHLIST
                          </button>
                        )}
                        {onWatchlist && (
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: 9,
                              color: '#00ff88',
                              padding: '8px 0',
                            }}
                          >
                            ✓ ON WATCHLIST
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 8,
                letterSpacing: 3,
                color: '#7a8fa8',
                marginBottom: 12,
              }}
            >
              FULL RESULTS
            </div>
            <div
              style={{
                background: '#111620',
                border: '1px solid #1e2a3a',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1e2a3a' }}>
                    {(
                      [
                        ['ticker', 'TICKER'],
                        ['conviction_score', 'CONVICTION'],
                        ['scan_type', 'TYPE'],
                        ['scan_date', 'DATE'],
                      ] as [SortKey, string][]
                    ).map(([key, label]) => (
                      <th
                        key={key}
                        onClick={() => toggleSort(key)}
                        style={{
                          padding: '10px 14px',
                          textAlign: 'left',
                          fontFamily: 'monospace',
                          fontSize: 9,
                          letterSpacing: 1,
                          color: sortKey === key ? '#00ff88' : '#7a8fa8',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        {label}
                        {sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : ''}
                      </th>
                    ))}
                    <th
                      style={{
                        padding: '10px 14px',
                        textAlign: 'left',
                        fontFamily: 'monospace',
                        fontSize: 9,
                        color: '#7a8fa8',
                      }}
                    >
                      THESIS
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          padding: 32,
                          textAlign: 'center',
                          color: '#3d5068',
                          fontFamily: 'monospace',
                          fontSize: 10,
                        }}
                      >
                        No results yet — run a full scan
                      </td>
                    </tr>
                  ) : (
                    tableRows.map((row, i) => (
                      <tr key={`${row.ticker}-${i}`} style={{ borderTop: '1px solid #1e2a3a40' }}>
                        <td
                          style={{
                            padding: '10px 14px',
                            fontFamily: 'monospace',
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#ffd700',
                          }}
                        >
                          {row.ticker}
                        </td>
                        <td
                          style={{
                            padding: '10px 14px',
                            fontFamily: 'monospace',
                            fontSize: 11,
                            color: convictionColor(row.conviction_score),
                          }}
                        >
                          {row.conviction_score}/10
                        </td>
                        <td
                          style={{
                            padding: '10px 14px',
                            fontFamily: 'monospace',
                            fontSize: 9,
                            color: '#3d9aff',
                          }}
                        >
                          {scanTypeLabel(row.scan_type)}
                        </td>
                        <td
                          style={{
                            padding: '10px 14px',
                            fontFamily: 'monospace',
                            fontSize: 10,
                            color: '#7a8fa8',
                          }}
                        >
                          {row.scan_date || '—'}
                        </td>
                        <td
                          style={{
                            padding: '10px 14px',
                            fontSize: 12,
                            color: '#e8edf5',
                            maxWidth: 360,
                          }}
                        >
                          {row.claude_thesis}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
