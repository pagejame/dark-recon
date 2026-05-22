'use client';

import { useCallback, useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import type { Thesis } from '@/types';
import { createJournalEntry } from '@/lib/db/journal';
import { cn } from '@/lib/utils';

interface SavedThesis {
  id: string;
  ticker: string;
  company_name: string | null;
  conviction_score: number | null;
  overall_direction: string | null;
  thesis_data: Thesis;
  generated_at: string;
}

const monoLabel =
  'font-mono text-[9px] uppercase tracking-[3px] text-text-muted';

const inputClass =
  'w-full rounded-md border border-border bg-bg-secondary px-4 py-4 font-mono text-xl uppercase tracking-wider text-text-primary placeholder:text-text-muted placeholder:normal-case focus:border-accent-green focus:outline-none';

function directionVariant(direction: string) {
  if (direction === 'bullish') return 'green' as const;
  if (direction === 'bearish') return 'red' as const;
  return 'yellow' as const;
}

function convictionColor(score: number) {
  if (score >= 8) return 'bg-accent-green';
  if (score >= 5) return 'bg-accent-yellow';
  return 'bg-accent-red';
}

function formatThesisForJournal(thesis: Thesis): string {
  return [
    thesis.dark_recon_verdict,
    '',
    `Bull: ${thesis.bull_case.summary}`,
    `Target: ${thesis.bull_case.price_target} (${thesis.bull_case.timeframe})`,
    `Play: ${thesis.options_setup.recommended_play}`,
  ].join('\n');
}

export default function ThesisBuilder() {
  const [ticker, setTicker] = useState('');
  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [savedTheses, setSavedTheses] = useState<SavedThesis[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingJournal, setSavingJournal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [journalSaved, setJournalSaved] = useState(false);

  const loadSavedTheses = useCallback(async () => {
    try {
      const res = await fetch('/api/thesis');
      if (res.ok) {
        const data = await res.json();
        setSavedTheses(data.theses || []);
      }
    } catch {
      // saved theses load failed silently
    }
  }, []);

  useEffect(() => {
    loadSavedTheses();
  }, [loadSavedTheses]);

  const generateThesis = useCallback(
    async (symbol?: string) => {
      const target = (symbol || ticker).trim().toUpperCase();
      if (!target) return;

      setLoading(true);
      setError(null);
      setJournalSaved(false);
      setThesis(null);

      try {
        const res = await fetch('/api/thesis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker: target }),
        });

        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Thesis generation failed');
          return;
        }

        setThesis(data as Thesis);
        await loadSavedTheses();
      } catch {
        setError('Thesis generation failed. Check your API keys and try again.');
      } finally {
        setLoading(false);
      }
    },
    [ticker, loadSavedTheses]
  );

  const handleSaveToJournal = async () => {
    if (!thesis) return;
    setSavingJournal(true);
    await createJournalEntry({
      ticker: thesis.ticker,
      thesis: formatThesisForJournal(thesis),
      signal_source: 'Thesis Builder',
      entry_notes: `Conviction ${thesis.conviction_score}/10 · ${thesis.overall_direction} · ${thesis.options_setup.recommended_play}`,
    });
    setSavingJournal(false);
    setJournalSaved(true);
  };

  const loadSavedThesis = (saved: SavedThesis) => {
    setTicker(saved.ticker);
    setThesis(saved.thesis_data);
    setError(null);
    setJournalSaved(false);
  };

  const activeTicker = ticker.trim().toUpperCase();

  return (
    <div className="space-y-6">
      {/* Top — Ticker Input */}
      <Card className="border-border bg-bg-card">
        <p className={cn(monoLabel, 'text-accent-green')}>THESIS BUILDER</p>
        <p className="mt-2 text-sm text-text-secondary">
          Type any ticker to generate a complete AI investment thesis
        </p>

        <div className="mt-6 space-y-4">
          <input
            type="text"
            className={inputClass}
            placeholder="Enter ticker (e.g. NVDA)"
            value={ticker}
            maxLength={5}
            onChange={(e) => setTicker(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading && activeTicker) generateThesis();
            }}
            disabled={loading}
            aria-label="Ticker symbol"
          />

          <Button
            className="w-full font-mono text-sm uppercase tracking-wider"
            onClick={() => generateThesis()}
            disabled={loading || !activeTicker}
          >
            BUILD THESIS
          </Button>

          {loading && (
            <p className="text-center font-mono text-xs uppercase tracking-wider text-text-secondary">
              AGENTS ANALYZING {activeTicker}…
            </p>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-accent-red/50 bg-accent-red-dim p-4">
            <p className="text-sm text-accent-red">{error}</p>
          </div>
        )}
      </Card>

      {/* Result — shown after generation */}
      {thesis && !loading && (
        <div className="animate-fade-in space-y-4">
          {/* 1. Header */}
          <Card className="bg-bg-card">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="font-heading text-2xl font-bold text-text-primary">
                  {thesis.company_name}
                </h2>
                <p className="font-mono text-lg text-text-secondary">{thesis.ticker}</p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <p className={monoLabel}>Current Price</p>
                  <p className="font-mono text-xl font-bold text-text-primary">
                    ${Number(thesis.current_price).toFixed(2)}
                  </p>
                </div>
                <Badge variant={directionVariant(thesis.overall_direction)}>
                  {thesis.overall_direction}
                </Badge>
              </div>
            </div>

            <div className="mt-6">
              <p className={monoLabel}>Conviction Score</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-heading text-4xl font-bold text-text-primary">
                  {thesis.conviction_score}
                </span>
                <span className="font-mono text-lg text-text-muted">/ 10</span>
              </div>
              <div className="mt-2 h-2 w-full max-w-md overflow-hidden rounded-full bg-bg-secondary">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    convictionColor(thesis.conviction_score)
                  )}
                  style={{ width: `${Math.min(thesis.conviction_score * 10, 100)}%` }}
                />
              </div>
            </div>
          </Card>

          {/* 2. Bull Case */}
          <Card accent="green" className="bg-bg-card">
            <p className={cn(monoLabel, 'text-accent-green')}>BULL CASE</p>
            <p className="mt-3 text-base leading-relaxed text-text-primary">
              {thesis.bull_case.summary}
            </p>
            <ul className="mt-4 space-y-2">
              {thesis.bull_case.points.map((point, i) => (
                <li key={i} className="flex gap-2 text-sm text-text-secondary">
                  <span className="text-accent-green">▸</span>
                  {point}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-accent-green/30 bg-accent-green-dim px-3 py-1 font-mono text-xs text-accent-green">
                {thesis.bull_case.price_target}
              </span>
              <span className="rounded-full border border-border bg-bg-secondary px-3 py-1 font-mono text-xs text-text-secondary">
                {thesis.bull_case.timeframe}
              </span>
            </div>
          </Card>

          {/* 3. Bear Case */}
          <Card accent="red" className="bg-bg-card">
            <p className={cn(monoLabel, 'text-accent-red')}>BEAR CASE</p>
            <p className="mt-3 text-base leading-relaxed text-text-primary">
              {thesis.bear_case.summary}
            </p>
            <ul className="mt-4 space-y-2">
              {thesis.bear_case.points.map((point, i) => (
                <li key={i} className="flex gap-2 text-sm text-text-secondary">
                  <span className="text-accent-red">▸</span>
                  {point}
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-2">
              <span className="inline-block rounded-full border border-accent-red/30 bg-accent-red-dim px-3 py-1 font-mono text-xs text-accent-red">
                Downside {thesis.bear_case.downside_target}
              </span>
              <p className="rounded-md border border-accent-red/20 bg-accent-red-dim/50 p-3 text-sm text-text-primary">
                <span className={monoLabel}>Key Risk </span>
                {thesis.bear_case.key_risk}
              </p>
            </div>
          </Card>

          {/* 4. Options Setup */}
          <Card accent="blue" className="bg-bg-card">
            <p className={cn(monoLabel, 'text-accent-blue')}>RECOMMENDED PLAY</p>
            <p className="mt-3 font-mono text-xl font-bold uppercase text-text-primary">
              {thesis.options_setup.recommended_play}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                { label: 'Strike', value: thesis.options_setup.strike },
                { label: 'Expiration', value: thesis.options_setup.expiration },
                { label: 'Max Loss', value: thesis.options_setup.max_loss },
                { label: 'Potential Gain', value: thesis.options_setup.potential_gain },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-md border border-border bg-bg-secondary p-3"
                >
                  <p className={monoLabel}>{item.label}</p>
                  <p className="mt-1 font-mono text-sm font-bold text-text-primary">{item.value}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-text-secondary">{thesis.options_setup.rationale}</p>
          </Card>

          {/* 5. Catalysts */}
          <Card className="bg-bg-card">
            <p className={monoLabel}>CATALYSTS</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {thesis.catalysts.upcoming.map((c, i) => (
                <span
                  key={i}
                  className="rounded-full border border-border bg-bg-secondary px-3 py-1 text-xs text-text-secondary"
                >
                  {c}
                </span>
              ))}
            </div>
            {thesis.catalysts.watch_dates.length > 0 && (
              <ul className="mt-4 space-y-1">
                {thesis.catalysts.watch_dates.map((d, i) => (
                  <li key={i} className="font-mono text-xs text-text-muted">
                    {d}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 6. Technical Levels */}
          <Card className="bg-bg-card">
            <p className={monoLabel}>TECHNICAL LEVELS</p>
            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-3">
              {[
                { label: 'Support', value: thesis.technical_levels.support },
                { label: 'Resistance', value: thesis.technical_levels.resistance },
                { label: 'Trend', value: thesis.technical_levels.trend },
              ].map((item) => (
                <div key={item.label} className="text-center sm:text-left">
                  <p className={monoLabel}>{item.label}</p>
                  <p className="mt-1 font-mono text-sm font-bold text-text-primary">{item.value}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* 7. Dark Recon Verdict */}
          <Card accent="yellow" className="bg-bg-card">
            <p className={cn(monoLabel, 'text-accent-yellow')}>DARK RECON VERDICT</p>
            <p className="mt-4 text-lg leading-relaxed text-text-primary">
              {thesis.dark_recon_verdict}
            </p>
          </Card>

          {/* 8. Action row */}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              className="font-mono text-xs uppercase tracking-wider"
              onClick={() => generateThesis(thesis.ticker)}
            >
              REGENERATE
            </Button>
            <Button
              variant="secondary"
              className="font-mono text-xs uppercase tracking-wider"
              onClick={handleSaveToJournal}
              disabled={savingJournal}
            >
              {savingJournal ? 'SAVING…' : journalSaved ? 'SAVED TO JOURNAL' : 'SAVE TO JOURNAL'}
            </Button>
          </div>
        </div>
      )}

      {/* Bottom — Saved Theses */}
      <div>
        <h2 className="mb-4 font-heading text-lg font-semibold text-text-primary">
          Saved Theses
        </h2>
        {savedTheses.length === 0 ? (
          <Card className="bg-bg-card">
            <p className="py-6 text-center text-sm text-text-secondary">
              Generated theses will appear here.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {savedTheses.map((saved) => (
              <button
                key={saved.id}
                type="button"
                onClick={() => loadSavedThesis(saved)}
                className="rounded-lg border border-border bg-bg-card p-4 text-left transition-colors hover:border-border-bright"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-lg font-bold text-text-primary">
                    {saved.ticker}
                  </span>
                  {saved.overall_direction && (
                    <Badge variant={directionVariant(saved.overall_direction)}>
                      {saved.overall_direction}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 truncate text-sm text-text-secondary">
                  {saved.company_name || saved.thesis_data?.company_name}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-mono text-sm text-accent-green">
                    {saved.conviction_score ?? saved.thesis_data?.conviction_score}/10
                  </span>
                  <span className="font-mono text-xs text-text-muted">
                    {new Date(saved.generated_at).toLocaleDateString()}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
