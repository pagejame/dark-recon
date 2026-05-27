// Twitter intelligence disabled — Nitter is dead as of 2024
// Replaced by news-feeds.ts (NASDAQ Trader + Benzinga + Yahoo Finance)

export const MARKET_ACCOUNTS: string[] = [];

export interface TwitterSignal {
  account: string;
  tweet: string;
  posted_at: string;
  tickers: string[];
  signal_type: string;
  strength: 'high' | 'medium' | 'low';
  conviction: number;
  summary: string;
}

export async function scanTwitterIntelligence(): Promise<TwitterSignal[]> {
  return []; // Disabled — use scanNewsFeeds() from news-feeds.ts instead
}

export async function saveTwitterSignals(_signals: TwitterSignal[]): Promise<void> {
  return; // Disabled
}
