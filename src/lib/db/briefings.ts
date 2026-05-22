import { createAdminClient } from '@/lib/supabase/admin';

export type BriefingInsert = {
  date: string;
  market_status: string;
  sentiment: string;
  briefing_text: string;
  top_signals: string[];
  key_levels: { label: string; value: string; note: string }[];
};

export type DbBriefing = BriefingInsert & {
  id: string;
  generated_at: string;
  created_at: string;
};

export async function saveBriefing(briefing: BriefingInsert) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('briefings')
    .insert(briefing)
    .select()
    .single();
  if (error) console.error('Save briefing error:', error);
  return data as DbBriefing | null;
}

export async function getTodaysBriefing() {
  const supabase = createAdminClient();
  const today = new Date().toDateString();
  const { data, error } = await supabase
    .from('briefings')
    .select('*')
    .eq('date', today)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== 'PGRST116') console.error('Get briefing error:', error);
  return (data as DbBriefing | null) || null;
}

export async function getBriefingHistory(limit = 7) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('briefings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) console.error('Get briefing history error:', error);
  return (data || []) as DbBriefing[];
}
