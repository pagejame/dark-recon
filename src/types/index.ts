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

export interface Thesis {
  id?: string;
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
}
