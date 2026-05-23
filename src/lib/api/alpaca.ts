const ALPACA_BASE_URL = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';
const ALPACA_API_KEY = process.env.ALPACA_API_KEY;
const ALPACA_API_SECRET = process.env.ALPACA_API_SECRET;

const alpacaHeaders = {
  'APCA-API-KEY-ID': ALPACA_API_KEY || '',
  'APCA-API-SECRET-KEY': ALPACA_API_SECRET || '',
  'Content-Type': 'application/json',
};

export async function getAccount() {
  const res = await fetch(`${ALPACA_BASE_URL}/v2/account`, {
    headers: alpacaHeaders,
  });
  if (!res.ok) throw new Error(`Alpaca account error: ${res.status}`);
  return res.json();
}

export async function getPositions() {
  const res = await fetch(`${ALPACA_BASE_URL}/v2/positions`, {
    headers: alpacaHeaders,
  });
  if (!res.ok) throw new Error(`Alpaca positions error: ${res.status}`);
  return res.json();
}

export async function getOrders(status = 'all', limit = 20) {
  const res = await fetch(`${ALPACA_BASE_URL}/v2/orders?status=${status}&limit=${limit}`, {
    headers: alpacaHeaders,
  });
  if (!res.ok) throw new Error(`Alpaca orders error: ${res.status}`);
  return res.json();
}

export async function submitMarketOrder({
  symbol,
  qty,
  side,
  type = 'market',
  time_in_force = 'day',
}: {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type?: string;
  time_in_force?: string;
}) {
  const res = await fetch(`${ALPACA_BASE_URL}/v2/orders`, {
    method: 'POST',
    headers: alpacaHeaders,
    body: JSON.stringify({ symbol, qty, side, type, time_in_force }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Order failed: ${res.status}`);
  }
  return res.json();
}

export async function submitLimitOrder({
  symbol,
  qty,
  side,
  limit_price,
  time_in_force = 'day',
}: {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  limit_price: number;
  time_in_force?: string;
}) {
  const res = await fetch(`${ALPACA_BASE_URL}/v2/orders`, {
    method: 'POST',
    headers: alpacaHeaders,
    body: JSON.stringify({ symbol, qty, side, type: 'limit', limit_price, time_in_force }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Limit order failed: ${res.status}`);
  }
  return res.json();
}

export async function closePosition(symbol: string) {
  const res = await fetch(`${ALPACA_BASE_URL}/v2/positions/${symbol}`, {
    method: 'DELETE',
    headers: alpacaHeaders,
  });
  if (!res.ok) throw new Error(`Close position failed: ${res.status}`);
  return res.json();
}

export async function getPosition(symbol: string) {
  const res = await fetch(`${ALPACA_BASE_URL}/v2/positions/${symbol}`, {
    headers: alpacaHeaders,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Get position failed: ${res.status}`);
  return res.json();
}

export async function cancelOrder(orderId: string) {
  const res = await fetch(`${ALPACA_BASE_URL}/v2/orders/${orderId}`, {
    method: 'DELETE',
    headers: alpacaHeaders,
  });
  if (!res.ok) throw new Error(`Cancel order failed: ${res.status}`);
  return { cancelled: true };
}

export async function getPortfolioHistory(period = '1M', timeframe = '1D') {
  const res = await fetch(
    `${ALPACA_BASE_URL}/v2/account/portfolio/history?period=${period}&timeframe=${timeframe}`,
    { headers: alpacaHeaders }
  );
  if (!res.ok) throw new Error(`Portfolio history error: ${res.status}`);
  return res.json();
}

export async function getLatestQuote(symbol: string) {
  const res = await fetch(
    `https://data.alpaca.markets/v2/stocks/${symbol}/quotes/latest`,
    { headers: alpacaHeaders }
  );
  if (!res.ok) return null;
  return res.json();
}

// Options chain data — uses data.alpaca.markets (different from trading API)
const ALPACA_DATA_BASE = 'https://data.alpaca.markets';

function alpacaDataHeaders() {
  return {
    'APCA-API-KEY-ID': ALPACA_API_KEY || '',
    'APCA-API-SECRET-KEY': ALPACA_API_SECRET || '',
    'Content-Type': 'application/json',
  };
}

export interface OptionsContract {
  symbol: string;
  underlying: string;
  expiration: string;
  strike: number;
  type: 'call' | 'put';
  bid: number;
  ask: number;
  mid: number;
  last: number;
  volume: number;
  open_interest: number;
  implied_volatility: number;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  iv_rank?: number;
  in_the_money: boolean;
  intrinsic_value: number;
  time_value: number;
  days_to_expiry: number;
}

export interface OptionsChainResult {
  underlying: string;
  current_price: number | null;
  contracts: OptionsContract[];
  expirations: string[];
  strikes: number[];
  fetched_at: string;
}

interface OptionsSnapshot {
  latestQuote?: { ap?: number; bp?: number };
  latestTrade?: { p?: number };
  greeks?: { delta?: number; gamma?: number; theta?: number; vega?: number };
  impliedVolatility?: number;
  volume?: number;
  openInterest?: number;
}

function parseOCCSymbol(
  symbol: string
): { underlying: string; expiration: string; type: 'call' | 'put'; strike: number } | null {
  try {
    const typeIndex = Math.max(symbol.lastIndexOf('C'), symbol.lastIndexOf('P'));
    if (typeIndex === -1) return null;

    const underlying = symbol.slice(0, typeIndex - 6);
    const dateStr = symbol.slice(typeIndex - 6, typeIndex);
    const type = symbol[typeIndex] === 'C' ? 'call' : 'put';
    const strikeRaw = symbol.slice(typeIndex + 1);
    const strike = parseInt(strikeRaw, 10) / 1000;

    const year = '20' + dateStr.slice(0, 2);
    const month = dateStr.slice(2, 4);
    const day = dateStr.slice(4, 6);
    const expiration = `${year}-${month}-${day}`;

    return { underlying, expiration, type, strike };
  } catch {
    return null;
  }
}

export async function getOptionsChainForTicker(
  ticker: string,
  options: {
    type?: 'call' | 'put';
    expirationDateGte?: string;
    expirationDateLte?: string;
    strikePriceGte?: number;
    strikePriceLte?: number;
    limit?: number;
    currentPrice?: number;
  } = {}
): Promise<OptionsChainResult> {
  const upperTicker = ticker.toUpperCase();
  const limit = options.limit || 200;

  const params = new URLSearchParams();
  params.set('feed', 'indicative');
  params.set('limit', limit.toString());
  if (options.type) params.set('type', options.type);
  if (options.expirationDateGte) params.set('expiration_date_gte', options.expirationDateGte);
  if (options.expirationDateLte) params.set('expiration_date_lte', options.expirationDateLte);
  if (options.strikePriceGte) params.set('strike_price_gte', options.strikePriceGte.toString());
  if (options.strikePriceLte) params.set('strike_price_lte', options.strikePriceLte.toString());

  const url = `${ALPACA_DATA_BASE}/v1beta1/options/snapshots/${upperTicker}?${params.toString()}`;

  const res = await fetch(url, { headers: alpacaDataHeaders() });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`Options chain error for ${upperTicker}:`, res.status, errorText);
    throw new Error(`Options chain fetch failed: ${res.status}`);
  }

  const data = await res.json();
  const snapshots = (data?.snapshots || {}) as Record<string, OptionsSnapshot>;
  const today = new Date();

  const contracts: OptionsContract[] = [];

  Object.entries(snapshots).forEach(([symbol, snapshot]) => {
    const parsed = parseOCCSymbol(symbol);
    if (!parsed) return;

    const bid = snapshot?.latestQuote?.bp || 0;
    const ask = snapshot?.latestQuote?.ap || 0;
    const last = snapshot?.latestTrade?.p || 0;
    const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : last;
    const iv = snapshot?.impliedVolatility || 0;
    const currentPrice = options.currentPrice || 0;

    const expiryDate = new Date(parsed.expiration);
    const daysToExpiry = Math.max(
      0,
      Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    );

    const inTheMoney =
      parsed.type === 'call' ? currentPrice > parsed.strike : currentPrice < parsed.strike;

    const intrinsicValue =
      parsed.type === 'call'
        ? Math.max(0, currentPrice - parsed.strike)
        : Math.max(0, parsed.strike - currentPrice);

    const timeValue = Math.max(0, mid - intrinsicValue);

    contracts.push({
      symbol,
      underlying: parsed.underlying,
      expiration: parsed.expiration,
      strike: parsed.strike,
      type: parsed.type,
      bid,
      ask,
      mid: Math.round(mid * 100) / 100,
      last,
      volume: snapshot?.volume || 0,
      open_interest: snapshot?.openInterest || 0,
      implied_volatility: Math.round(iv * 10000) / 100,
      delta: snapshot?.greeks?.delta ?? null,
      gamma: snapshot?.greeks?.gamma ?? null,
      theta: snapshot?.greeks?.theta ?? null,
      vega: snapshot?.greeks?.vega ?? null,
      in_the_money: inTheMoney,
      intrinsic_value: Math.round(intrinsicValue * 100) / 100,
      time_value: Math.round(timeValue * 100) / 100,
      days_to_expiry: daysToExpiry,
    });
  });

  contracts.sort((a, b) => {
    if (a.expiration !== b.expiration) return a.expiration.localeCompare(b.expiration);
    return a.strike - b.strike;
  });

  const expirations = [...new Set(contracts.map((c) => c.expiration))].sort();
  const strikes = [...new Set(contracts.map((c) => c.strike))].sort((a, b) => a - b);

  return {
    underlying: upperTicker,
    current_price: options.currentPrice || null,
    contracts,
    expirations,
    strikes,
    fetched_at: new Date().toISOString(),
  };
}

export async function getOptionsExpirations(ticker: string): Promise<string[]> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const ninetyDays = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const params = new URLSearchParams({
      feed: 'indicative',
      limit: '10',
      expiration_date_gte: today,
      expiration_date_lte: ninetyDays,
      type: 'call',
    });

    const res = await fetch(
      `${ALPACA_DATA_BASE}/v1beta1/options/snapshots/${ticker.toUpperCase()}?${params}`,
      { headers: alpacaDataHeaders() }
    );

    if (!res.ok) return [];
    const data = await res.json();
    const snapshots = (data?.snapshots || {}) as Record<string, OptionsSnapshot>;

    const expirations = new Set<string>();
    Object.keys(snapshots).forEach((symbol) => {
      const parsed = parseOCCSymbol(symbol);
      if (parsed) expirations.add(parsed.expiration);
    });

    return [...expirations].sort();
  } catch {
    return [];
  }
}

export async function placeOptionsOrder(params: {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  limit_price?: number;
  time_in_force?: string;
}) {
  const body: Record<string, unknown> = {
    symbol: params.symbol,
    qty: params.qty,
    side: params.side,
    type: params.type,
    time_in_force: params.time_in_force || 'day',
    order_class: 'simple',
  };

  if (params.type === 'limit' && params.limit_price) {
    body.limit_price = params.limit_price;
  }

  const res = await fetch(`${ALPACA_BASE_URL}/v2/orders`, {
    method: 'POST',
    headers: alpacaHeaders,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || `Options order failed: ${res.status}`);
  }

  return res.json();
}
