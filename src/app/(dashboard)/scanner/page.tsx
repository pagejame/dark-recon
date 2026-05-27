'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import type { MacroSnapshot } from '@/lib/api/fred';
import type { AnalystData } from '@/lib/api/yahoo-finance';
import type { SectorRotation } from '@/lib/services/sector-rotation';
import type { MomentumStock } from '@/lib/services/momentum-screener';
import type { FearGreedData, EconomicEvent } from '@/lib/api/market-sentiment';
import type { InsiderTrade } from '@/lib/api/fmp';
import type { NewsSignal } from '@/lib/api/news-feeds';

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
  sector_rotation?: SectorRotation;
  momentum_leaders?: MomentumStock[];
  macro_snapshot?: MacroSnapshot;
  analyst_picks?: AnalystData[];
  news_signals?: NewsSignal[];
  scanned_at?: string;
  cached?: boolean;
}

interface SentimentData {
  fear_greed: FearGreedData | null;
  economic_events: EconomicEvent[];
  insider_trades: InsiderTrade[];
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
  momentum: 'MOMENTUM',
  multi_signal: 'MULTI SIGNAL',
  news_feed: 'BREAKING NEWS',
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
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);

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
    void fetch('/api/sentiment')
      .then((r) => r.json())
      .then((data) => setSentiment(data))
      .catch(() => setSentiment(null));
  }, [runScan]);

  const addToWatchlist = async (ticker: string, notes?: string) => {
    await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, notes }),
    });
    setWatchlistTickers((prev) => new Set([...prev, ticker.toUpperCase()]));
  };

  const signals = useMemo(() => scanData?.signals || [], [scanData?.signals]);
  const topOpportunities =
    scanData?.top_opportunities || signals.filter((s) => s.conviction_score >= 7);
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
    <div className="dr-page">
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
                fontSize: 'clamp(20px, 5vw, 32px)',
                fontWeight: 800,
                color: '#e8edf5',
                margin: 0,
              }}
            >
              Market Scanner
            </h1>
            <div style={{ fontSize: 'clamp(11px, 3vw, 14px)', color: '#7a8fa8', marginTop: 4 }}>
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

          {sentiment?.fear_greed && (
            <div
              style={{
                background: '#111620',
                border: `1px solid ${
                  sentiment.fear_greed.is_contrarian_buy
                    ? '#00ff8840'
                    : sentiment.fear_greed.is_contrarian_sell
                      ? '#ff3d5a40'
                      : '#1e2a3a'
                }`,
                borderLeft: `3px solid ${
                  sentiment.fear_greed.value <= 25
                    ? '#00ff88'
                    : sentiment.fear_greed.value >= 75
                      ? '#ff3d5a'
                      : sentiment.fear_greed.value <= 40
                        ? '#3d9aff'
                        : sentiment.fear_greed.value >= 60
                          ? '#ffd700'
                          : '#7a8fa8'
                }`,
                borderRadius: 10,
                padding: 20,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 9,
                      letterSpacing: 3,
                      color: '#7a8fa8',
                      marginBottom: 6,
                    }}
                  >
                    FEAR & GREED INDEX
                  </div>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 28,
                      fontWeight: 700,
                      color: '#e8edf5',
                    }}
                  >
                    {sentiment.fear_greed.value}
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#7a8fa8' }}>
                    {sentiment.fear_greed.label}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#7a8fa8', lineHeight: 1.6 }}>
                    {sentiment.fear_greed.trading_signal}
                  </div>
                  {sentiment.fear_greed.is_contrarian_buy && (
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 10,
                        color: '#00ff88',
                        marginTop: 6,
                      }}
                    >
                      ⚡ CONTRARIAN BUY SIGNAL ACTIVE
                    </div>
                  )}
                  {sentiment.fear_greed.is_contrarian_sell && (
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 10,
                        color: '#ff3d5a',
                        marginTop: 6,
                      }}
                    >
                      ⚠️ CONTRARIAN CAUTION SIGNAL ACTIVE
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {scanData?.news_signals && scanData.news_signals.length > 0 && (
            <div
              style={{
                background: '#111620',
                border: '1px solid #1e2a3a',
                borderLeft: '3px solid #ff6b35',
                borderRadius: 10,
                padding: 20,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 9,
                  letterSpacing: 3,
                  color: '#ff6b35',
                  marginBottom: 14,
                }}
              >
                📡 BREAKING NEWS INTELLIGENCE
              </div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 8,
                  color: '#3d5068',
                  marginBottom: 10,
                }}
              >
                NASDAQ TRADER · BENZINGA · YAHOO FINANCE
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {scanData.news_signals.slice(0, 5).map((signal, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#0d1117',
                      border: '1px solid #1e2a3a',
                      borderRadius: 8,
                      padding: '10px 14px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{ fontFamily: 'monospace', fontSize: 9, color: '#ff6b35' }}
                      >
                        {signal.source.toUpperCase()}
                      </span>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 8,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background:
                            signal.strength === 'high' ? '#00ff8815' : '#ffd70015',
                          color: signal.strength === 'high' ? '#00ff88' : '#ffd700',
                          border: `1px solid ${signal.strength === 'high' ? '#00ff8830' : '#ffd70030'}`,
                        }}
                      >
                        {signal.strength.toUpperCase()}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: '#e8edf5',
                        lineHeight: 1.5,
                        marginBottom: 6,
                      }}
                    >
                      {signal.summary}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {signal.tickers.map((ticker) => (
                        <span
                          key={ticker}
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 10,
                            color: '#ffd700',
                            background: '#ffd70010',
                            border: '1px solid #ffd70030',
                            padding: '2px 8px',
                            borderRadius: 10,
                          }}
                        >
                          {ticker}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {scanData?.macro_snapshot && (
            <div
              style={{
                background: '#111620',
                border: `1px solid ${
                  scanData.macro_snapshot.macro_regime === 'expansionary'
                    ? '#00ff8830'
                    : scanData.macro_snapshot.macro_regime === 'contractionary'
                      ? '#ff3d5a30'
                      : scanData.macro_snapshot.macro_regime === 'stagflation'
                        ? '#ffd70030'
                        : '#1e2a3a'
                }`,
                borderLeft: `3px solid ${
                  scanData.macro_snapshot.macro_regime === 'expansionary'
                    ? '#00ff88'
                    : scanData.macro_snapshot.macro_regime === 'contractionary'
                      ? '#ff3d5a'
                      : scanData.macro_snapshot.macro_regime === 'stagflation'
                        ? '#ffd700'
                        : '#7a8fa8'
                }`,
                borderRadius: 10,
                padding: 20,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 9,
                    letterSpacing: 3,
                    color: '#7a8fa8',
                  }}
                >
                  MACRO BACKDROP (FRED)
                </div>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 9,
                    letterSpacing: 2,
                    fontWeight: 700,
                    padding: '3px 12px',
                    borderRadius: 20,
                    background:
                      scanData.macro_snapshot.macro_regime === 'expansionary'
                        ? '#00ff8815'
                        : '#ff3d5a15',
                    color:
                      scanData.macro_snapshot.macro_regime === 'expansionary'
                        ? '#00ff88'
                        : scanData.macro_snapshot.macro_regime === 'contractionary'
                          ? '#ff3d5a'
                          : '#ffd700',
                    border: '1px solid currentColor',
                  }}
                >
                  {scanData.macro_snapshot.macro_regime.toUpperCase()}
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: 10,
                }}
              >
                {[
                  {
                    label: 'FED FUNDS',
                    value: `${scanData.macro_snapshot.fed_funds_rate?.value ?? 'N/A'}%`,
                    trend: scanData.macro_snapshot.fed_funds_rate?.trend,
                  },
                  {
                    label: 'UNEMPLOYMENT',
                    value: `${scanData.macro_snapshot.unemployment?.value ?? 'N/A'}%`,
                    trend: scanData.macro_snapshot.unemployment?.trend,
                  },
                  {
                    label: '10Y YIELD',
                    value: `${scanData.macro_snapshot.treasury_10y?.value ?? 'N/A'}%`,
                    trend: scanData.macro_snapshot.treasury_10y?.trend,
                  },
                  {
                    label: 'YIELD CURVE',
                    value: `${scanData.macro_snapshot.yield_curve?.toFixed(2) ?? 'N/A'}%`,
                    trend:
                      (scanData.macro_snapshot.yield_curve || 0) > 0 ? 'rising' : 'falling',
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{ background: '#0d1117', borderRadius: 8, padding: '10px 12px' }}
                  >
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 8,
                        color: '#3d5068',
                        letterSpacing: 2,
                        marginBottom: 4,
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 16,
                        fontWeight: 700,
                        color: '#e8edf5',
                      }}
                    >
                      {item.value}
                    </div>
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 9,
                        color:
                          item.trend === 'rising'
                            ? '#ffd700'
                            : item.trend === 'falling'
                              ? '#3d9aff'
                              : '#3d5068',
                      }}
                    >
                      {item.trend === 'rising' ? '▲' : item.trend === 'falling' ? '▼' : '→'}{' '}
                      {item.trend}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {scanData?.sector_rotation && (
            <div
              style={{
                background: '#111620',
                border: '1px solid #1e2a3a',
                borderLeft: `3px solid ${
                  scanData.sector_rotation.market_regime === 'risk_on'
                    ? '#00ff88'
                    : scanData.sector_rotation.market_regime === 'risk_off'
                      ? '#ff3d5a'
                      : '#ffd700'
                }`,
                borderRadius: 10,
                padding: 20,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 9,
                    letterSpacing: 3,
                    color: '#7a8fa8',
                  }}
                >
                  SECTOR ROTATION
                </div>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 9,
                    letterSpacing: 2,
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: 20,
                    background:
                      scanData.sector_rotation.market_regime === 'risk_on'
                        ? '#00ff8815'
                        : '#ff3d5a15',
                    color:
                      scanData.sector_rotation.market_regime === 'risk_on'
                        ? '#00ff88'
                        : scanData.sector_rotation.market_regime === 'risk_off'
                          ? '#ff3d5a'
                          : '#ffd700',
                    border: `1px solid ${
                      scanData.sector_rotation.market_regime === 'risk_on'
                        ? '#00ff8840'
                        : '#ff3d5a40'
                    }`,
                  }}
                >
                  {scanData.sector_rotation.market_regime.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: '#7a8fa8',
                  marginBottom: 14,
                  lineHeight: 1.6,
                }}
              >
                {scanData.sector_rotation.rotation_signal}
              </div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <div>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 8,
                      color: '#00ff88',
                      letterSpacing: 2,
                      marginBottom: 6,
                    }}
                  >
                    LEADING ↑
                  </div>
                  {scanData.sector_rotation.leading_sectors.map((s) => (
                    <div
                      key={s.sector}
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: '#00ff88',
                        marginBottom: 2,
                      }}
                    >
                      {s.sector} {s.etf} +{s.change_1d.toFixed(2)}%
                    </div>
                  ))}
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 8,
                      color: '#ff3d5a',
                      letterSpacing: 2,
                      marginBottom: 6,
                    }}
                  >
                    LAGGING ↓
                  </div>
                  {scanData.sector_rotation.lagging_sectors.map((s) => (
                    <div
                      key={s.sector}
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: '#ff3d5a',
                        marginBottom: 2,
                      }}
                    >
                      {s.sector} {s.etf} {s.change_1d.toFixed(2)}%
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {scanData?.momentum_leaders && scanData.momentum_leaders.length > 0 && (
            <div
              style={{
                background: '#111620',
                border: '1px solid #1e2a3a',
                borderRadius: 10,
                padding: 20,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 9,
                  letterSpacing: 3,
                  color: '#7a8fa8',
                  marginBottom: 14,
                }}
              >
                MOMENTUM LEADERS — OUTPERFORMING TODAY
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: 8,
                }}
              >
                {scanData.momentum_leaders.map((stock) => (
                  <div
                    key={stock.ticker}
                    style={{
                      background: '#0d1117',
                      border: `1px solid ${stock.change_1d >= 0 ? '#00ff8830' : '#ff3d5a30'}`,
                      borderRadius: 8,
                      padding: '10px 12px',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#ffd700',
                      }}
                    >
                      {stock.ticker}
                    </div>
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 14,
                        fontWeight: 700,
                        color: stock.change_1d >= 0 ? '#00ff88' : '#ff3d5a',
                        margin: '4px 0',
                      }}
                    >
                      {stock.change_1d >= 0 ? '+' : ''}
                      {stock.change_1d.toFixed(2)}%
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068' }}>
                      {stock.volume_ratio}x vol
                    </div>
                  </div>
                ))}
              </div>
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
              <div className="dr-table-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
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
          </div>
        </>
      )}
    </div>
  );
}
