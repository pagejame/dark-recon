'use client';

import { useState, useEffect, type ReactNode, type KeyboardEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import TradeModal from '@/components/trading/TradeModal';

interface ThesisResult {
  ticker: string;
  company_name: string;
  current_price: number;
  conviction_score: number;
  overall_direction: 'bullish' | 'bearish' | 'neutral';
  bull_case: {
    summary: string;
    points: string[];
    price_target: string;
    timeframe: string;
  };
  bear_case: {
    summary: string;
    points: string[];
    downside_target: string;
    key_risk: string;
  };
  catalysts: {
    upcoming: string[];
    watch_dates: string[];
  };
  options_setup: {
    recommended_play: string;
    strike: string;
    expiration: string;
    rationale: string;
    max_loss: string;
    potential_gain: string;
  };
  technical_levels: {
    support: string;
    resistance: string;
    trend: string;
  };
  insider_activity: string;
  news_sentiment: string;
  dark_recon_verdict: string;
  generated_at: string;
  data_sources?: string[];
}

interface SavedThesis {
  id: string;
  ticker: string;
  company_name: string;
  conviction_score: number;
  overall_direction: string;
  generated_at: string;
  thesis_data: ThesisResult;
}

function ConvictionBar({ score }: { score: number }) {
  const color = score >= 8 ? '#00ff88' : score >= 5 ? '#ffd700' : '#ff3d5a';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 700, color }}>{score}</span>
      <div style={{ flex: 1, height: 6, background: '#1e2a3a', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${score * 10}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#7a8fa8' }}>/10</span>
    </div>
  );
}

function DirectionPill({ direction }: { direction: string }) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    bullish: { bg: '#00ff8815', text: '#00ff88', border: '#00ff8840' },
    bearish: { bg: '#ff3d5a15', text: '#ff3d5a', border: '#ff3d5a40' },
    neutral: { bg: '#ffd70015', text: '#ffd700', border: '#ffd70040' },
  };
  const c = colors[direction] || colors.neutral;
  return (
    <span style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, padding: '4px 12px', borderRadius: 20, fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, fontWeight: 700 }}>
      {direction.toUpperCase()}
    </span>
  );
}

function SectionCard({ label, borderColor, children }: { label: string; borderColor: string; children: ReactNode }) {
  return (
    <div
      className="mb-3 rounded-[10px] border border-border bg-bg-card p-3.5 md:p-6"
      style={{ borderLeft: `3px solid ${borderColor}` }}
    >
      <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 3, color: borderColor, textTransform: 'uppercase', marginBottom: 14 }}>{label}</div>
      {children}
    </div>
  );
}

export default function ThesisPageClient() {
  const searchParams = useSearchParams();
  const [ticker, setTicker] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thesis, setThesis] = useState<ThesisResult | null>(null);
  const [savedTheses, setSavedTheses] = useState<SavedThesis[]>([]);
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [tradeSuccess, setTradeSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/thesis')
      .then(r => r.json())
      .then(d => setSavedTheses(d.theses || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = searchParams.get('ticker');
    if (t) setTicker(t.toUpperCase());
  }, [searchParams]);

  const buildThesis = async () => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setLoading(true);
    setError(null);
    setThesis(null);
    try {
      const res = await fetch('/api/thesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: t }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setThesis(data);
      fetch('/api/thesis').then(r => r.json()).then(d => setSavedTheses(d.theses || [])).catch(() => {});
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Thesis generation failed. Check your API keys.';
      setError(message);
    }
    setLoading(false);
  };

  const handleKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') buildThesis();
  };

  const loadSaved = (saved: SavedThesis) => {
    setThesis(saved.thesis_data);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveToJournal = async () => {
    if (!thesis) return;
    try {
      await fetch('/api/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: thesis.ticker,
          position_type: thesis.overall_direction === 'bullish' ? 'call' : 'put',
          thesis: thesis.dark_recon_verdict,
          signal_source: 'Thesis Builder',
          entry_notes: `Bull: ${thesis.bull_case.summary} | Bear: ${thesis.bear_case.summary}`,
        }),
      });
      alert('Saved to journal.');
    } catch {
      alert('Failed to save to journal.');
    }
  };

  const executeTrade = async (order: {
    qty: number;
    order_type: 'market' | 'limit';
    limit_price?: number;
  }) => {
    if (!thesis) return;
    setTradeLoading(true);
    setTradeError(null);
    try {
      const side = thesis.overall_direction === 'bullish' ? 'buy' : 'sell';
      const res = await fetch('/api/trading/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: thesis.ticker,
          qty: order.qty,
          side,
          order_type: order.order_type,
          limit_price: order.limit_price,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Order failed');
      setTradeModalOpen(false);
      setTradeSuccess('Order submitted');
      setTimeout(() => setTradeSuccess(null), 3000);
    } catch (e) {
      setTradeError(e instanceof Error ? e.message : 'Order failed');
    } finally {
      setTradeLoading(false);
    }
  };

  useEffect(() => {
    const onPullRefresh = () => {
      fetch('/api/thesis')
        .then((r) => r.json())
        .then((d) => setSavedTheses(d.theses || []))
        .catch(() => {});
    };
    window.addEventListener('dark-recon-refresh', onPullRefresh);
    return () => window.removeEventListener('dark-recon-refresh', onPullRefresh);
  }, []);

  return (
    <div className="mx-auto max-w-[900px] px-3.5 py-6 md:p-6">
      {/* Input Card */}
      <div className="mb-6 rounded-xl border border-border bg-bg-card p-3.5 md:p-6">
        <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 3, color: '#00ff88', textTransform: 'uppercase', marginBottom: 8 }}>Thesis Builder</div>
        <div style={{ fontSize: 13, color: '#7a8fa8', marginBottom: 20 }}>Type any ticker to generate a complete AI investment thesis</div>
        <input
          type="text"
          value={ticker}
          onChange={e => setTicker(e.target.value.toUpperCase())}
          onKeyDown={handleKey}
          placeholder="Enter ticker (e.g. NVDA)"
          disabled={loading}
          className="mb-3 w-full rounded-lg border border-border bg-bg-secondary px-4 py-3.5 font-mono text-base tracking-widest text-text-primary outline-none md:text-lg"
        />
        <button
          onClick={buildThesis}
          disabled={loading || !ticker.trim()}
          style={{
            width: '100%',
            padding: '14px',
            background: loading || !ticker.trim() ? '#1e2a3a' : '#00ff88',
            color: loading || !ticker.trim() ? '#7a8fa8' : '#080a0f',
            border: 'none',
            borderRadius: 8,
            fontFamily: 'monospace',
            fontSize: 12,
            letterSpacing: 3,
            fontWeight: 700,
            cursor: loading || !ticker.trim() ? 'not-allowed' : 'pointer',
            textTransform: 'uppercase',
          }}
        >
          {loading ? `AGENTS ANALYZING ${ticker}...` : 'BUILD THESIS'}
        </button>
        {error && (
          <div style={{ marginTop: 12, padding: 14, background: '#ff3d5a10', border: '1px solid #ff3d5a40', borderRadius: 8, color: '#ff8fa0', fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>

      {/* Thesis Result */}
      {thesis && (
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
          
          {/* Header */}
          <SectionCard label="Analysis" borderColor="#3d9aff">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 24, fontWeight: 800, color: '#e8edf5' }}>{thesis.company_name}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#ffd700', letterSpacing: 2, marginTop: 2 }}>{thesis.ticker} · ${thesis.current_price}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                <DirectionPill direction={thesis.overall_direction} />
                <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#7a8fa8', letterSpacing: 1 }}>CONVICTION</div>
                <ConvictionBar score={thesis.conviction_score} />
              </div>
            </div>
            {thesis.data_sources && thesis.data_sources.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 8, letterSpacing: 2, color: '#3d5068' }}>DATA:</span>
                {thesis.data_sources.map((source, i) => (
                  <span
                    key={i}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 8,
                      letterSpacing: 1,
                      color: '#3d9aff',
                      background: '#3d9aff10',
                      border: '1px solid #3d9aff30',
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    {source}
                  </span>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Bull Case */}
          <SectionCard label="Bull Case" borderColor="#00ff88">
            <div style={{ fontSize: 15, color: '#e8edf5', marginBottom: 12, lineHeight: 1.5 }}>{thesis.bull_case.summary}</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px' }}>
              {thesis.bull_case.points.map((p, i) => (
                <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#7a8fa8', marginBottom: 6 }}>
                  <span style={{ color: '#00ff88', flexShrink: 0 }}>▸</span>{p}
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ background: '#00ff8815', color: '#00ff88', border: '1px solid #00ff8840', padding: '4px 12px', borderRadius: 20, fontFamily: 'monospace', fontSize: 10, letterSpacing: 1 }}>TARGET {thesis.bull_case.price_target}</span>
              <span style={{ background: '#3d9aff15', color: '#3d9aff', border: '1px solid #3d9aff40', padding: '4px 12px', borderRadius: 20, fontFamily: 'monospace', fontSize: 10, letterSpacing: 1 }}>{thesis.bull_case.timeframe}</span>
            </div>
          </SectionCard>

          {/* Bear Case */}
          <SectionCard label="Bear Case" borderColor="#ff3d5a">
            <div style={{ fontSize: 15, color: '#e8edf5', marginBottom: 12, lineHeight: 1.5 }}>{thesis.bear_case.summary}</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px' }}>
              {thesis.bear_case.points.map((p, i) => (
                <li key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#7a8fa8', marginBottom: 6 }}>
                  <span style={{ color: '#ff3d5a', flexShrink: 0 }}>▸</span>{p}
                </li>
              ))}
            </ul>
            <div style={{ background: '#ff3d5a10', border: '1px solid #ff3d5a30', borderRadius: 8, padding: 12, fontSize: 12, color: '#ff8fa0' }}>
              <strong style={{ color: '#ff3d5a' }}>KEY RISK:</strong> {thesis.bear_case.key_risk}
            </div>
            <div style={{ marginTop: 10 }}>
              <span style={{ background: '#ff3d5a15', color: '#ff3d5a', border: '1px solid #ff3d5a40', padding: '4px 12px', borderRadius: 20, fontFamily: 'monospace', fontSize: 10, letterSpacing: 1 }}>DOWNSIDE {thesis.bear_case.downside_target}</span>
            </div>
          </SectionCard>

          {/* Options Setup */}
          <SectionCard label="Recommended Play" borderColor="#3d9aff">
            <div style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: '#3d9aff', marginBottom: 16 }}>{thesis.options_setup.recommended_play}</div>
            <div className="mb-3.5 grid grid-cols-2 gap-2.5 md:gap-2.5">
              {[
                { label: 'STRIKE', value: thesis.options_setup.strike },
                { label: 'EXPIRATION', value: thesis.options_setup.expiration },
                { label: 'MAX LOSS', value: thesis.options_setup.max_loss },
                { label: 'POTENTIAL GAIN', value: thesis.options_setup.potential_gain },
              ].map(item => (
                <div key={item.label} style={{ background: '#0d1117', border: '1px solid #1e2a3a', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 8, letterSpacing: 2, color: '#7a8fa8', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 14, color: '#e8edf5', fontWeight: 700 }}>{item.value}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 13, color: '#7a8fa8', lineHeight: 1.6 }}>{thesis.options_setup.rationale}</div>
          </SectionCard>

          {/* Catalysts */}
          <SectionCard label="Catalysts" borderColor="#ff8c3d">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {thesis.catalysts.upcoming.map((c, i) => (
                <span key={i} style={{ background: '#ff8c3d15', color: '#ff8c3d', border: '1px solid #ff8c3d40', padding: '6px 12px', borderRadius: 20, fontSize: 12 }}>{c}</span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {thesis.catalysts.watch_dates.map((d, i) => (
                <span key={i} style={{ fontFamily: 'monospace', fontSize: 10, color: '#7a8fa8', background: '#1e2a3a', padding: '4px 10px', borderRadius: 6 }}>📅 {d}</span>
              ))}
            </div>
          </SectionCard>

          {/* Technical Levels */}
          <SectionCard label="Technical Levels" borderColor="#7a8fa8">
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
              {[
                { label: 'SUPPORT', value: thesis.technical_levels.support, color: '#00ff88' },
                { label: 'RESISTANCE', value: thesis.technical_levels.resistance, color: '#ff3d5a' },
                { label: 'TREND', value: thesis.technical_levels.trend, color: '#3d9aff' },
              ].map(item => (
                <div key={item.label} style={{ background: '#0d1117', border: '1px solid #1e2a3a', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 8, letterSpacing: 2, color: '#7a8fa8', marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 13, color: item.color, fontWeight: 700 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Verdict */}
          <SectionCard label="Dark Recon Verdict" borderColor="#ffd700">
            <div style={{ fontSize: 16, color: '#e8edf5', lineHeight: 1.7 }}>{thesis.dark_recon_verdict}</div>
            <div style={{ marginTop: 10, fontSize: 12, color: '#7a8fa8' }}>News: {thesis.news_sentiment} · Insider: {thesis.insider_activity}</div>
          </SectionCard>

          {/* Action Row */}
          {tradeSuccess && (
            <div style={{ marginBottom: 12, padding: 12, background: '#00ff8815', border: '1px solid #00ff8840', borderRadius: 8, color: '#00ff88', fontFamily: 'monospace', fontSize: 11, letterSpacing: 1 }}>
              {tradeSuccess}
            </div>
          )}
          <div className="mb-8 flex flex-col gap-3 md:flex-row md:gap-3">
            <button onClick={buildThesis} className="w-full rounded-lg border border-border bg-bg-card px-3.5 py-3.5 font-mono text-[10px] tracking-wider text-text-secondary md:flex-1">
              REGENERATE
            </button>
            <button onClick={saveToJournal} className="w-full rounded-lg border border-accent-green/40 bg-accent-green-dim px-3.5 py-3.5 font-mono text-[10px] tracking-wider text-accent-green md:flex-1">
              SAVE TO JOURNAL
            </button>
            <button
              onClick={() => { setTradeError(null); setTradeModalOpen(true); }}
              className="w-full rounded-lg border border-accent-green/60 bg-accent-green px-3.5 py-3.5 font-mono text-[10px] font-bold tracking-wider text-bg-primary md:flex-1"
            >
              ◆ EXECUTE TRADE
            </button>
          </div>
        </div>
      )}

      {/* Saved Theses */}
      {savedTheses.length > 0 && (
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: 9, letterSpacing: 3, color: '#7a8fa8', textTransform: 'uppercase', marginBottom: 12 }}>Saved Theses</div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
            {savedTheses.map(s => (
              <div key={s.id} onClick={() => loadSaved(s)} style={{ background: '#111620', border: '1px solid #1e2a3a', borderRadius: 10, padding: 14, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#ffd700' }}>{s.ticker}</span>
                  <DirectionPill direction={s.overall_direction} />
                </div>
                <div style={{ fontSize: 11, color: '#7a8fa8', marginBottom: 4 }}>{s.company_name}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#3d5068' }}>{new Date(s.generated_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      <TradeModal
        isOpen={tradeModalOpen}
        onClose={() => {
          setTradeModalOpen(false);
          setTradeError(null);
        }}
        onConfirm={executeTrade}
        ticker={thesis?.ticker || ''}
        side={thesis?.overall_direction === 'bullish' ? 'buy' : 'sell'}
        suggestedPlay={thesis?.options_setup.recommended_play}
        loading={tradeLoading}
        error={tradeError}
      />
    </div>
  );
}
