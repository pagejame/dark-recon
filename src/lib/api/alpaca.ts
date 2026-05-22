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
