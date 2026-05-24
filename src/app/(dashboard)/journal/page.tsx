'use client';

import { useCallback, useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import {
  closePosition,
  createJournalEntry,
  createPosition,
  getJournalEntries,
  getOpenPositions,
  updateJournalEntry,
  type DbPosition,
  type JournalEntry,
} from '@/lib/db/journal';
import { Loader2 } from 'lucide-react';

const inputClass =
  'w-full rounded-md border border-border bg-bg-secondary px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none';
const labelClass = 'mb-1.5 block font-mono text-xs uppercase tracking-wider text-text-muted';

function formatPrice(value: number | null | undefined) {
  if (value == null) return '$0.00';
  return `$${Number(value).toFixed(2)}`;
}

function resultVariant(result: JournalEntry['result']) {
  if (result === 'win') return 'green' as const;
  if (result === 'loss') return 'red' as const;
  if (result === 'breakeven') return 'yellow' as const;
  return 'muted' as const;
}

export default function JournalPage() {
  const [positions, setPositions] = useState<DbPosition[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [addPositionOpen, setAddPositionOpen] = useState(false);
  const [closePositionOpen, setClosePositionOpen] = useState<DbPosition | null>(null);
  const [newEntryOpen, setNewEntryOpen] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState<JournalEntry | null>(null);

  const [positionForm, setPositionForm] = useState({
    ticker: '',
    position_type: 'stock' as 'stock' | 'call' | 'put',
    entry_price: '',
    quantity: '1',
    strike_price: '',
    expiration_date: '',
  });
  const [exitPrice, setExitPrice] = useState('');
  const [entryForm, setEntryForm] = useState({
    ticker: '',
    position_type: 'stock',
    thesis: '',
    signal_source: '',
    entry_notes: '',
  });
  const [editForm, setEditForm] = useState({
    exit_notes: '',
    result: '' as '' | 'win' | 'loss' | 'breakeven',
    lessons: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const [openPositions, journalEntries] = await Promise.all([
      getOpenPositions(),
      getJournalEntries(),
    ]);
    setPositions(openPositions);
    setEntries(journalEntries);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddPosition = async () => {
    if (!positionForm.ticker || !positionForm.entry_price) return;
    setSaving(true);
    await createPosition({
      ticker: positionForm.ticker.toUpperCase(),
      position_type: positionForm.position_type,
      entry_price: parseFloat(positionForm.entry_price),
      quantity: parseInt(positionForm.quantity, 10) || 1,
      strike_price: positionForm.strike_price
        ? parseFloat(positionForm.strike_price)
        : undefined,
      expiration_date: positionForm.expiration_date || undefined,
    });
    setAddPositionOpen(false);
    setPositionForm({
      ticker: '',
      position_type: 'stock',
      entry_price: '',
      quantity: '1',
      strike_price: '',
      expiration_date: '',
    });
    await loadData();
    setSaving(false);
  };

  const handleClosePosition = async () => {
    if (!closePositionOpen || !exitPrice) return;
    setSaving(true);
    await closePosition(closePositionOpen.id, parseFloat(exitPrice));
    setClosePositionOpen(null);
    setExitPrice('');
    await loadData();
    setSaving(false);
  };

  const handleNewEntry = async () => {
    if (!entryForm.ticker) return;
    setSaving(true);
    await createJournalEntry({
      ticker: entryForm.ticker.toUpperCase(),
      position_type: entryForm.position_type,
      thesis: entryForm.thesis || undefined,
      signal_source: entryForm.signal_source || undefined,
      entry_notes: entryForm.entry_notes || undefined,
    });
    setNewEntryOpen(false);
    setEntryForm({
      ticker: '',
      position_type: 'stock',
      thesis: '',
      signal_source: '',
      entry_notes: '',
    });
    await loadData();
    setSaving(false);
  };

  const openEntryDetail = (entry: JournalEntry) => {
    setExpandedEntry(entry);
    setEditForm({
      exit_notes: entry.exit_notes || '',
      result: entry.result || '',
      lessons: entry.lessons || '',
    });
  };

  const handleUpdateEntry = async () => {
    if (!expandedEntry) return;
    setSaving(true);
    await updateJournalEntry(expandedEntry.id, {
      exit_notes: editForm.exit_notes || undefined,
      result: editForm.result || undefined,
      lessons: editForm.lessons || undefined,
    });
    setExpandedEntry(null);
    await loadData();
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-text-primary">Trade Journal</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Document trades, track results, and capture lessons.
        </p>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-heading text-lg font-semibold text-text-primary">Open Positions</h2>
          <Button size="sm" onClick={() => setAddPositionOpen(true)}>
            Add Position
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin text-accent-green" />
            Loading positions…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-text-muted">
                  <th className="pb-3 pr-4 font-medium">Ticker</th>
                  <th className="pb-3 pr-4 font-medium">Type</th>
                  <th className="pb-3 pr-4 font-medium">Entry</th>
                  <th className="pb-3 pr-4 font-medium">Qty</th>
                  <th className="pb-3 pr-4 font-medium">Strike</th>
                  <th className="pb-3 pr-4 font-medium">Expiry</th>
                  <th className="pb-3 pr-4 font-medium">P&amp;L</th>
                  <th className="pb-3 pr-4 font-medium">Opened</th>
                  <th className="pb-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {positions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-text-secondary">
                      No open positions. Add one to start tracking.
                    </td>
                  </tr>
                ) : (
                  positions.map((pos) => {
                    const isOption =
                      pos.position_type === 'call' || pos.position_type === 'put';

                    return (
                    <tr key={pos.id} className="border-b border-border/50">
                      <td className="py-3 pr-4 font-mono font-bold text-text-primary">
                        <span>{pos.ticker}</span>
                        {isOption && (
                          <span
                            className="ml-2 font-mono text-[8px] tracking-wide"
                            style={{
                              color: '#3d9aff',
                              background: '#3d9aff15',
                              border: '1px solid #3d9aff40',
                              padding: '1px 6px',
                              borderRadius: 4,
                            }}
                          >
                            OPT
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 uppercase text-text-secondary">
                        {isOption ? (
                          <Badge variant={pos.position_type === 'call' ? 'green' : 'red'}>
                            {pos.position_type.toUpperCase()}
                          </Badge>
                        ) : (
                          pos.position_type
                        )}
                      </td>
                      <td className="py-3 pr-4 font-mono text-text-primary">
                        {formatPrice(pos.entry_price)}
                        {isOption && (
                          <span className="ml-1 text-xs text-text-muted">/contract</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-mono text-text-secondary">{pos.quantity}</td>
                      <td className="py-3 pr-4 font-mono text-text-muted">
                        {isOption && pos.strike_price
                          ? formatPrice(pos.strike_price)
                          : '—'}
                      </td>
                      <td className="py-3 pr-4 font-mono text-text-muted">
                        {isOption && pos.expiration_date
                          ? new Date(pos.expiration_date).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="py-3 pr-4 font-mono text-text-muted">$0.00</td>
                      <td className="py-3 pr-4 font-mono text-xs text-text-muted">
                        {new Date(pos.opened_at).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setClosePositionOpen(pos)}
                        >
                          Close
                        </Button>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="font-heading text-lg font-semibold text-text-primary">Journal Entries</h2>
          <Button size="sm" onClick={() => setNewEntryOpen(true)}>
            New Entry
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin text-accent-green" />
            Loading entries…
          </div>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-secondary">No journal entries yet.</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => openEntryDetail(entry)}
                className="flex w-full items-center justify-between rounded-md border border-border bg-bg-secondary px-4 py-3 text-left transition-colors hover:border-border-bright"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-sm font-bold text-text-primary">
                    {entry.ticker}
                  </span>
                  <p className="mt-1 truncate text-xs text-text-secondary">
                    {entry.thesis || entry.entry_notes || 'No thesis recorded'}
                  </p>
                </div>
                <div className="ml-4 flex shrink-0 items-center gap-3">
                  <Badge variant={resultVariant(entry.result)}>
                    {entry.result || 'pending'}
                  </Badge>
                  <span className="font-mono text-xs text-text-muted">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Modal open={addPositionOpen} onClose={() => setAddPositionOpen(false)} title="Add Position">
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Ticker</label>
            <input
              className={inputClass}
              value={positionForm.ticker}
              onChange={(e) => setPositionForm({ ...positionForm, ticker: e.target.value })}
              placeholder="NVDA"
            />
          </div>
          <div>
            <label className={labelClass}>Type</label>
            <select
              className={inputClass}
              value={positionForm.position_type}
              onChange={(e) =>
                setPositionForm({
                  ...positionForm,
                  position_type: e.target.value as 'stock' | 'call' | 'put',
                })
              }
            >
              <option value="stock">Stock</option>
              <option value="call">Call</option>
              <option value="put">Put</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Entry Price</label>
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={positionForm.entry_price}
                onChange={(e) =>
                  setPositionForm({ ...positionForm, entry_price: e.target.value })
                }
              />
            </div>
            <div>
              <label className={labelClass}>Quantity</label>
              <input
                type="number"
                className={inputClass}
                value={positionForm.quantity}
                onChange={(e) => setPositionForm({ ...positionForm, quantity: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Strike Price (optional)</label>
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={positionForm.strike_price}
                onChange={(e) =>
                  setPositionForm({ ...positionForm, strike_price: e.target.value })
                }
              />
            </div>
            <div>
              <label className={labelClass}>Expiration (optional)</label>
              <input
                type="date"
                className={inputClass}
                value={positionForm.expiration_date}
                onChange={(e) =>
                  setPositionForm({ ...positionForm, expiration_date: e.target.value })
                }
              />
            </div>
          </div>
          <Button onClick={handleAddPosition} disabled={saving}>
            {saving ? 'Saving…' : 'Save Position'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={!!closePositionOpen}
        onClose={() => setClosePositionOpen(null)}
        title={`Close ${closePositionOpen?.ticker || ''}`}
      >
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Exit Price</label>
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
            />
          </div>
          <Button onClick={handleClosePosition} disabled={saving || !exitPrice}>
            {saving ? 'Closing…' : 'Close Position'}
          </Button>
        </div>
      </Modal>

      <Modal open={newEntryOpen} onClose={() => setNewEntryOpen(false)} title="New Journal Entry">
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Ticker</label>
            <input
              className={inputClass}
              value={entryForm.ticker}
              onChange={(e) => setEntryForm({ ...entryForm, ticker: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>Position Type</label>
            <select
              className={inputClass}
              value={entryForm.position_type}
              onChange={(e) => setEntryForm({ ...entryForm, position_type: e.target.value })}
            >
              <option value="stock">Stock</option>
              <option value="call">Call</option>
              <option value="put">Put</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Thesis</label>
            <textarea
              rows={3}
              className={inputClass}
              value={entryForm.thesis}
              onChange={(e) => setEntryForm({ ...entryForm, thesis: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>Signal Source</label>
            <input
              className={inputClass}
              value={entryForm.signal_source}
              onChange={(e) => setEntryForm({ ...entryForm, signal_source: e.target.value })}
              placeholder="Market Scanner, insider, etc."
            />
          </div>
          <div>
            <label className={labelClass}>Entry Notes</label>
            <textarea
              rows={3}
              className={inputClass}
              value={entryForm.entry_notes}
              onChange={(e) => setEntryForm({ ...entryForm, entry_notes: e.target.value })}
            />
          </div>
          <Button onClick={handleNewEntry} disabled={saving || !entryForm.ticker}>
            {saving ? 'Saving…' : 'Save Entry'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={!!expandedEntry}
        onClose={() => setExpandedEntry(null)}
        title={expandedEntry ? `${expandedEntry.ticker} — Journal Entry` : 'Entry'}
        className="max-w-2xl"
      >
        {expandedEntry && (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-bg-secondary p-4 text-sm text-text-secondary">
              {expandedEntry.thesis && (
                <p>
                  <span className={labelClass}>Thesis</span>
                  {expandedEntry.thesis}
                </p>
              )}
              {expandedEntry.signal_source && (
                <p className="mt-2">
                  <span className={labelClass}>Signal Source</span>
                  {expandedEntry.signal_source}
                </p>
              )}
              {expandedEntry.entry_notes && (
                <p className="mt-2">
                  <span className={labelClass}>Entry Notes</span>
                  {expandedEntry.entry_notes}
                </p>
              )}
            </div>
            <div>
              <label className={labelClass}>Exit Notes</label>
              <textarea
                rows={3}
                className={inputClass}
                value={editForm.exit_notes}
                onChange={(e) => setEditForm({ ...editForm, exit_notes: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>Result</label>
              <select
                className={inputClass}
                value={editForm.result}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    result: e.target.value as '' | 'win' | 'loss' | 'breakeven',
                  })
                }
              >
                <option value="">Pending</option>
                <option value="win">Win</option>
                <option value="loss">Loss</option>
                <option value="breakeven">Breakeven</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Lessons</label>
              <textarea
                rows={3}
                className={inputClass}
                value={editForm.lessons}
                onChange={(e) => setEditForm({ ...editForm, lessons: e.target.value })}
              />
            </div>
            <Button onClick={handleUpdateEntry} disabled={saving}>
              {saving ? 'Saving…' : 'Update Entry'}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
