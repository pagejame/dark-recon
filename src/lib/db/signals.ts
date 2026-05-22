import { createClient } from '@/lib/supabase/client';

export type SignalInsert = {
  ticker: string;
  signal_type: string;
  strength: 'high' | 'medium' | 'low';
  summary: string;
  raw_data?: unknown;
  status?: 'pending' | 'confirmed' | 'passed' | 'executed';
  scanned_at?: string;
};

export type DbSignal = SignalInsert & {
  id: string;
  scanned_at: string;
  created_at: string;
};

export async function signalExistsRecently(ticker: string, signalType: string): Promise<boolean> {
  const supabase = createClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('signals')
    .select('id')
    .eq('ticker', ticker)
    .eq('signal_type', signalType)
    .gte('created_at', oneHourAgo)
    .limit(1);
  if (error) console.error('Check duplicate signal error:', error);
  return (data?.length ?? 0) > 0;
}

export async function saveSignal(signal: SignalInsert) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('signals')
    .insert(signal)
    .select()
    .single();
  if (error) console.error('Save signal error:', error);
  return data;
}

export async function getRecentSignals(limit = 20) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) console.error('Get signals error:', error);
  return (data || []) as DbSignal[];
}

export async function getHighConvictionSignals() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .eq('strength', 'high')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) console.error('Get high conviction signals error:', error);
  return (data || []) as DbSignal[];
}

export async function updateSignalStatus(
  id: string,
  status: 'pending' | 'confirmed' | 'passed' | 'executed'
) {
  const supabase = createClient();
  const { error } = await supabase.from('signals').update({ status }).eq('id', id);
  if (error) console.error('Update signal status error:', error);
}

export async function getSignalsByTicker(ticker: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .eq('ticker', ticker)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) console.error('Get ticker signals error:', error);
  return (data || []) as DbSignal[];
}
