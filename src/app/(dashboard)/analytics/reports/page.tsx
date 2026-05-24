'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatReportAsMarkdown, type WeeklyAuditReport } from '@/lib/services/weekly-audit-format';

interface ReportSummary {
  id: string;
  week_start: string;
  week_end: string;
  claude_analysis?: string;
  recommendations?: string[];
  performance_summary?: {
    week_pnl?: number;
    week_pnl_pct?: number;
    ending_equity?: number;
  };
  generated_at: string;
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadMarkdown(report: WeeklyAuditReport) {
  const md = formatReportAsMarkdown(report);
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dark-recon-audit-${new Date(report.week_start).toISOString().split('T')[0]}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function WeeklyReportsPage() {
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fullReport, setFullReport] = useState<WeeklyAuditReport | null>(null);
  const [generating, setGenerating] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/reports');
      const data = await res.json();
      setReports(data.reports || []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  const loadFullReport = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setFullReport(null);
      return;
    }
    setExpandedId(id);
    setFullReport(null);
    try {
      const res = await fetch(`/api/reports?id=${id}`);
      const data = await res.json();
      setFullReport(data.report as WeeklyAuditReport);
    } catch {
      setFullReport(null);
    }
  };

  const generateNow = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/reports', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await fetchReports();
        if (data.id) setExpandedId(data.id);
        if (data.report) setFullReport(data.report);
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 9,
            letterSpacing: 3,
            color: '#9b5de5',
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
              Weekly Audit Reports
            </h1>
            <div style={{ fontSize: 13, color: '#7a8fa8', marginTop: 4 }}>
              Claude-analyzed performance reviews — every Sunday at 6PM ET
            </div>
          </div>
          <button
            type="button"
            onClick={() => void generateNow()}
            disabled={generating}
            style={{
              padding: '10px 24px',
              background: generating ? '#1e2a3a' : '#9b5de5',
              color: generating ? '#7a8fa8' : '#080a0f',
              border: 'none',
              borderRadius: 8,
              fontFamily: 'monospace',
              fontSize: 10,
              letterSpacing: 2,
              fontWeight: 700,
              cursor: generating ? 'not-allowed' : 'pointer',
            }}
          >
            {generating ? 'GENERATING...' : '📊 GENERATE NOW'}
          </button>
        </div>
      </div>

      {loading ? (
        <div
          style={{
            textAlign: 'center',
            padding: 48,
            color: '#7a8fa8',
            fontFamily: 'monospace',
            fontSize: 10,
            letterSpacing: 2,
          }}
        >
          LOADING REPORTS...
        </div>
      ) : reports.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: 48,
            color: '#3d5068',
            fontFamily: 'monospace',
            fontSize: 10,
            letterSpacing: 2,
          }}
        >
          NO REPORTS YET — First report runs Sunday 6PM ET
        </div>
      ) : (
        <div>
          {reports.map((report) => {
            const pnl = report.performance_summary?.week_pnl ?? 0;
            const pnlColor = pnl >= 0 ? '#00ff88' : '#ff3d5a';
            const expanded = expandedId === report.id;
            const topRec = report.recommendations?.[0];

            return (
              <div
                key={report.id}
                style={{
                  background: '#111620',
                  border: '1px solid #1e2a3a',
                  borderLeft: `3px solid ${pnlColor}`,
                  borderRadius: 10,
                  marginBottom: 10,
                  overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => void loadFullReport(report.id)}
                  style={{
                    padding: '14px 18px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#7a8fa8' }}>
                      {new Date(report.week_start).toLocaleDateString()} –{' '}
                      {new Date(report.week_end).toLocaleDateString()}
                    </div>
                    {topRec && (
                      <div
                        style={{
                          fontSize: 12,
                          color: '#e8edf5',
                          marginTop: 4,
                          maxWidth: 480,
                        }}
                      >
                        → {topRec}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 18,
                          fontWeight: 700,
                          color: pnlColor,
                        }}
                      >
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068' }}>
                        week P&L
                      </div>
                    </div>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#3d5068' }}>
                      {expanded ? '▼' : '▶'}
                    </span>
                  </div>
                </div>

                {expanded && (
                  <div
                    style={{
                      borderTop: '1px solid #1e2a3a',
                      padding: '16px 18px',
                    }}
                  >
                    {!fullReport ? (
                      <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#3d5068' }}>
                        Loading full report...
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 8,
                            letterSpacing: 3,
                            color: '#9b5de5',
                            marginBottom: 10,
                          }}
                        >
                          CLAUDE ANALYSIS
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: '#e8edf5',
                            lineHeight: 1.8,
                            whiteSpace: 'pre-wrap',
                            marginBottom: 16,
                          }}
                        >
                          {fullReport.claude_analysis}
                        </div>

                        {fullReport.recommendations.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div
                              style={{
                                fontFamily: 'monospace',
                                fontSize: 8,
                                letterSpacing: 3,
                                color: '#ffd700',
                                marginBottom: 8,
                              }}
                            >
                              RECOMMENDATIONS
                            </div>
                            {fullReport.recommendations.map((r, i) => (
                              <div
                                key={i}
                                style={{
                                  fontSize: 12,
                                  color: '#7a8fa8',
                                  padding: '4px 0',
                                  borderTop: i > 0 ? '1px solid #1e2a3a40' : undefined,
                                }}
                              >
                                {i + 1}. {r}
                              </div>
                            ))}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => downloadJson(fullReport, `dark-recon-audit-${report.id}.json`)}
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
                            ↓ DOWNLOAD JSON
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadMarkdown(fullReport)}
                            style={{
                              padding: '8px 16px',
                              background: '#9b5de515',
                              border: '1px solid #9b5de540',
                              borderRadius: 8,
                              color: '#9b5de5',
                              fontFamily: 'monospace',
                              fontSize: 9,
                              letterSpacing: 1,
                              cursor: 'pointer',
                            }}
                          >
                            ↓ DOWNLOAD MARKDOWN
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
