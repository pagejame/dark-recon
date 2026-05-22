import { createAdminClient } from '@/lib/supabase/admin';

export interface PriceAlert {
  id: string;
  ticker: string;
  condition: 'above' | 'below';
  target_price: number;
  current_price?: number;
  status: 'active' | 'triggered' | 'dismissed';
  note?: string;
  triggered_at?: string;
  created_at: string;
}

export async function getActiveAlerts(): Promise<PriceAlert[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('price_alerts')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) console.error('Get alerts error:', error);
  return data || [];
}

export async function getAllAlerts(): Promise<PriceAlert[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('price_alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) console.error('Get all alerts error:', error);
  return data || [];
}

export async function createAlert(alert: {
  ticker: string;
  condition: 'above' | 'below';
  target_price: number;
  note?: string;
}): Promise<PriceAlert | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('price_alerts')
    .insert({
      ticker: alert.ticker.toUpperCase(),
      condition: alert.condition,
      target_price: alert.target_price,
      note: alert.note,
    })
    .select()
    .single();
  if (error) console.error('Create alert error:', error);
  return data;
}

export async function triggerAlert(id: string, currentPrice: number): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('price_alerts')
    .update({
      status: 'triggered',
      current_price: currentPrice,
      triggered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
}

export async function dismissAlert(id: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('price_alerts')
    .update({ status: 'dismissed', updated_at: new Date().toISOString() })
    .eq('id', id);
}

export async function deleteAlert(id: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from('price_alerts').delete().eq('id', id);
}

export async function updateAlertPrice(id: string, currentPrice: number): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('price_alerts')
    .update({ current_price: currentPrice, updated_at: new Date().toISOString() })
    .eq('id', id);
}
