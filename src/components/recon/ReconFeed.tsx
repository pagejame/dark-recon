'use client';

import { useCallback, useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import {
  addToWatchlist,
  getWatchlist,
  removeFromWatchlist,
  updateWatchlistNotes,
  type WatchlistItem,
} from '@/lib/db/watchlist';
import type { ScanResult } from '@/lib/agents/scanner';
import { Loader2, X } from 'lucide-react';

const inputClass =
  'w-full rounded-md border border-border bg-bg-secondary px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none';

export default function ReconFeed() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [signals, setSignals] = useState<ScanResult[]>([]);
  const [newTicker, setNewTicker] = useState('');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const loadWatchlist = useCallback(async () => {
    const items = await getWatchlist();
    setWatchlist(items);
    return items;
  }, []);

  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/scan');
      if (res.ok) {
        const data = await res.json();
        setSignals(data.signals || []);
      }
    } catch {
      // scan failed silently
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadWatchlist();
      await runScan();
      setLoading(false);
    })();
  }, [loadWatchlist, runScan]);

  const handleAddTicker = async () => {
    const ticker = newTicker.trim().toUpperCase();
    if (!ticker) return;
    await addToWatchlist(ticker);
    setNewTicker('');
    await loadWatchlist();
    await runScan();
  };

  const handleRemove = async (ticker: string) => {
    await removeFromWatchlist(ticker);
    await loadWatchlist();
  };

  const handleNotesBlur = async (ticker: string, notes: string) => {
    await updateWatchlistNotes(ticker, notes);
  };

  const strengthVariant = (strength: string) => {
    if (strength === 'high') return 'green' as const;
    if (strength === 'medium') return 'yellow' as const;
    return 'muted' as const;
  };

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="font-heading text-lg font-semibold text-text-primary">Watchlist</h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            className={inputClass}
            placeholder="Add ticker (e.g. PLTR)"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTicker()}
          />
          <Button onClick={handleAddTicker} className="shrink-0">
            Add to Watchlist
          </Button>
        </div>

        {loading ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin text-accent-green" />
            Loading watchlist…
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {watchlist.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border bg-bg-secondary p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-lg font-bold text-text-primary">
                    {item.ticker}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(item.ticker)}
                    aria-label={`Remove ${item.ticker}`}
                  >
                    <X className="h-4 w-4 text-text-muted hover:text-accent-red" />
                  </Button>
                </div>
                <input
                  className="w-full rounded border border-border/50 bg-bg-card px-2 py-1.5 text-xs text-text-secondary focus:border-accent-blue focus:outline-none"
                  placeholder="Notes…"
                  defaultValue={item.notes || ''}
                  onBlur={(e) => handleNotesBlur(item.ticker, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card accent="green">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-heading text-lg font-semibold text-text-primary">Live Signals</h2>
          <div className="flex items-center gap-3">
            {scanning && <Loader2 className="h-4 w-4 animate-spin text-accent-green" />}
            <Button variant="secondary" size="sm" onClick={runScan} disabled={scanning}>
              Run Scan
            </Button>
          </div>
        </div>

        {signals.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-secondary">
            {scanning
              ? 'Market Scanner is analyzing your watchlist…'
              : 'No signals yet. Run a scan to detect opportunities.'}
          </p>
        ) : (
          <div className="space-y-4">
            {signals.map((signal) => (
              <div
                key={`${signal.ticker}-${signal.scanned_at}`}
                className="rounded-md border border-border bg-bg-secondary p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold text-text-primary">
                    {signal.ticker}
                  </span>
                  <Badge variant="blue">{signal.signal_type.replace(/_/g, ' ')}</Badge>
                  <Badge variant={strengthVariant(signal.strength)}>{signal.strength}</Badge>
                  <span className="font-mono text-xs text-text-muted">
                    {new Date(signal.scanned_at).toLocaleTimeString()}
                  </span>
                </div>
                <p className="mt-2 text-sm text-text-secondary">{signal.summary}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
