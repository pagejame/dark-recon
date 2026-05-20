export interface Signal {
  id: string;
  ticker: string;
  signal_type: 'unusual_options' | 'insider_buy' | 'dark_pool' | 'momentum' | 'squeeze';
  strength: 'high' | 'medium' | 'low';
  thesis: string;
  agent: string;
  created_at: string;
  status: 'pending' | 'confirmed' | 'passed' | 'executed';
}

export interface Position {
  id: string;
  ticker: string;
  position_type: 'stock' | 'call' | 'put';
  entry_price: number;
  current_price: number;
  quantity: number;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at?: string;
  pnl?: number;
}

export interface Agent {
  id: string;
  name: string;
  type: 'scanner' | 'thesis' | 'risk' | 'pattern' | 'briefing' | 'journal';
  status: 'active' | 'standby' | 'error';
  last_run?: string;
}

export interface TradeJournal {
  id: string;
  position_id: string;
  ticker: string;
  thesis: string;
  entry_notes: string;
  exit_notes?: string;
  result?: 'win' | 'loss' | 'breakeven';
  lessons?: string;
  created_at: string;
}
