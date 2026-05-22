import { createAdminClient } from '@/lib/supabase/admin';

export type WatchlistItem = {
  id: string;
  ticker: string;
  notes: string | null;
  added_at: string;
};

export async function getWatchlist() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('watchlist')
    .select('*')
    .order('added_at', { ascending: true });
  if (error) console.error('Get watchlist error:', error);
  return (data || []) as WatchlistItem[];
}

export async function addToWatchlist(ticker: string, notes?: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('watchlist')
    .insert({ ticker: ticker.toUpperCase(), notes })
    .select()
    .single();
  if (error) console.error('Add watchlist error:', error);
  return data as WatchlistItem | null;
}

export async function removeFromWatchlist(ticker: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('ticker', ticker.toUpperCase());
  if (error) console.error('Remove watchlist error:', error);
}

export async function updateWatchlistNotes(ticker: string, notes: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('watchlist')
    .update({ notes })
    .eq('ticker', ticker.toUpperCase());
  if (error) console.error('Update watchlist notes error:', error);
}
