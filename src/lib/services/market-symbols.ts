import { createAdminClient } from '@/lib/supabase/admin';

const SP500_CORE = [
  'MSFT', 'AAPL', 'NVDA', 'AMZN', 'GOOGL', 'GOOG', 'META', 'TSLA', 'BRK.B', 'LLY',
  'JPM', 'V', 'UNH', 'XOM', 'MA', 'JNJ', 'HD', 'PG', 'COST', 'NFLX',
  'AVGO', 'MRK', 'CVX', 'WMT', 'KO', 'BAC', 'ABBV', 'PEP', 'CRM', 'MCD',
  'TMO', 'ORCL', 'AMD', 'GE', 'ADBE', 'QCOM', 'TXN', 'PM', 'ACN', 'DHR',
  'WFC', 'SPGI', 'ISRG', 'RTX', 'DIS', 'NEE', 'LOW', 'MS', 'GS', 'BX',
  'UBER', 'INTU', 'T', 'SCHW', 'PFE', 'AMGN', 'UNP', 'CAT', 'BKNG', 'AXP',
  'HON', 'C', 'CMCSA', 'TJX', 'SYK', 'IBM', 'AMAT', 'MDT', 'GD', 'DE',
  'BSX', 'VRTX', 'REGN', 'ADI', 'MU', 'GILD', 'PLD', 'LRCX', 'MMC', 'SO',
  'CI', 'ZTS', 'BDX', 'EOG', 'ITW', 'DUK', 'COP', 'CME', 'NOC', 'SHW',
  'ICE', 'USB', 'MCK', 'ETN', 'APD', 'WM', 'TDG', 'GM', 'F', 'PLTR',
  'ARM', 'SMCI', 'MSTR', 'CRWD', 'PANW', 'SNOW', 'DDOG', 'NET', 'ZS', 'SHOP',
  'COIN', 'HOOD', 'RBLX', 'U', 'DUOL', 'CELH', 'ENPH', 'FSLR', 'RUN', 'PLUG',
  'RIVN', 'LCID', 'NIO', 'LI', 'XPEV', 'SOFI', 'AFRM', 'UPST', 'NU', 'PYPL',
  'SQ', 'ROKU', 'SNAP', 'PINS', 'TWLO', 'ZM', 'DOCU', 'OKTA', 'ESTC', 'MDB',
  'MRNA', 'BNTX', 'NVAX', 'SGEN', 'BMRN', 'ALNY', 'INSM', 'KRYS', 'ARGT', 'RXRX',
  'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLC', 'XLY', 'XLP', 'XLRE', 'XLB', 'XLU',
  'QQQ', 'SPY', 'IWM', 'DIA', 'VXX', 'SQQQ', 'TQQQ', 'SPXU', 'UPRO',
];

const NASDAQ100_TICKERS = new Set([
  'MSFT', 'AAPL', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'COST', 'NFLX',
  'AMD', 'ADBE', 'QCOM', 'TXN', 'INTU', 'AMAT', 'MU', 'LRCX', 'ARM', 'CRWD',
  'PANW', 'SNOW', 'DDOG', 'NET', 'SHOP',
]);

export async function loadMarketSymbols(): Promise<number> {
  const supabase = createAdminClient();

  const symbolsToLoad = SP500_CORE.map((ticker) => ({
    ticker,
    in_sp500: true,
    in_nasdaq100: NASDAQ100_TICKERS.has(ticker),
    last_updated: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('market_symbols')
    .upsert(symbolsToLoad, { onConflict: 'ticker' });

  if (error) throw error;
  return symbolsToLoad.length;
}

export async function getMarketSymbols(options?: {
  sp500Only?: boolean;
  nasdaq100Only?: boolean;
  limit?: number;
}): Promise<string[]> {
  const supabase = createAdminClient();

  let query = supabase.from('market_symbols').select('ticker');

  if (options?.sp500Only) query = query.eq('in_sp500', true);
  if (options?.nasdaq100Only) query = query.eq('in_nasdaq100', true);
  if (options?.limit) query = query.limit(options.limit);

  const { data } = await query;
  return (data || []).map((s: { ticker: string }) => s.ticker);
}

export async function getSymbolCount(): Promise<number> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from('market_symbols')
    .select('*', { count: 'exact', head: true });
  return count || 0;
}
