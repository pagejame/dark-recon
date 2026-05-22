import { createAdminClient } from '@/lib/supabase/admin';

export type DbPosition = {
  id: string;
  ticker: string;
  position_type: 'stock' | 'call' | 'put';
  entry_price: number;
  current_price: number | null;
  quantity: number;
  strike_price: number | null;
  expiration_date: string | null;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at: string | null;
  exit_price: number | null;
  pnl: number | null;
  pnl_percent: number | null;
};

export type JournalEntry = {
  id: string;
  position_id: string | null;
  ticker: string;
  position_type: string | null;
  thesis: string | null;
  signal_source: string | null;
  entry_notes: string | null;
  exit_notes: string | null;
  result: 'win' | 'loss' | 'breakeven' | null;
  lessons: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  positions?: DbPosition | null;
};

export async function createPosition(position: {
  ticker: string;
  position_type: 'stock' | 'call' | 'put';
  entry_price: number;
  quantity: number;
  strike_price?: number;
  expiration_date?: string;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('positions')
    .insert(position)
    .select()
    .single();
  if (error) console.error('Create position error:', error);
  return data as DbPosition | null;
}

export async function getOpenPositions() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .eq('status', 'open')
    .order('opened_at', { ascending: false });
  if (error) console.error('Get positions error:', error);
  return (data || []) as DbPosition[];
}

export async function closePosition(id: string, exitPrice: number) {
  const supabase = createAdminClient();
  const position = await supabase.from('positions').select('*').eq('id', id).single();
  if (!position.data) return null;

  const entry = Number(position.data.entry_price);
  const qty = position.data.quantity;
  const pnl = (exitPrice - entry) * qty;
  const pnlPercent = ((exitPrice - entry) / entry) * 100;

  const { data, error } = await supabase
    .from('positions')
    .update({
      status: 'closed',
      exit_price: exitPrice,
      closed_at: new Date().toISOString(),
      pnl,
      pnl_percent: pnlPercent,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) console.error('Close position error:', error);
  return data as DbPosition | null;
}

export async function createJournalEntry(entry: {
  position_id?: string;
  ticker: string;
  position_type?: string;
  thesis?: string;
  signal_source?: string;
  entry_notes?: string;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('trade_journal')
    .insert(entry)
    .select()
    .single();
  if (error) console.error('Create journal entry error:', error);
  return data as JournalEntry | null;
}

export async function getJournalEntries(limit = 50) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('trade_journal')
    .select('*, positions(*)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) console.error('Get journal entries error:', error);
  return (data || []) as JournalEntry[];
}

export async function updateJournalEntry(
  id: string,
  updates: {
    exit_notes?: string;
    result?: 'win' | 'loss' | 'breakeven';
    lessons?: string;
    tags?: string[];
  }
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('trade_journal')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) console.error('Update journal entry error:', error);
  return data as JournalEntry | null;
}
