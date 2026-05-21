const POLYGON_BASE = 'https://api.polygon.io';
const API_KEY = process.env.POLYGON_API_KEY;

export async function getTickerSnapshot(ticker: string) {
  const res = await fetch(
    `${POLYGON_BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${API_KEY}`
  );
  return res.json();
}

export async function getMultipleSnapshots(tickers: string[]) {
  const joined = tickers.join(',');
  const res = await fetch(
    `${POLYGON_BASE}/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${joined}&apiKey=${API_KEY}`
  );
  return res.json();
}

export async function getOptionsChain(ticker: string) {
  const res = await fetch(
    `${POLYGON_BASE}/v3/snapshot/options/${ticker}?limit=50&apiKey=${API_KEY}`
  );
  return res.json();
}

export async function getMarketStatus() {
  const res = await fetch(
    `${POLYGON_BASE}/v1/marketstatus/now?apiKey=${API_KEY}`
  );
  return res.json();
}

export async function getPreviousClose(ticker: string) {
  const res = await fetch(
    `${POLYGON_BASE}/v2/aggs/ticker/${ticker}/prev?apiKey=${API_KEY}`
  );
  return res.json();
}

export async function getAggregates(
  ticker: string,
  multiplier: number,
  timespan: string,
  from: string,
  to: string
) {
  const res = await fetch(
    `${POLYGON_BASE}/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=120&apiKey=${API_KEY}`
  );
  return res.json();
}

export async function getTickerNews(ticker: string, limit = 10) {
  const res = await fetch(
    `${POLYGON_BASE}/v2/reference/news?ticker=${ticker}&limit=${limit}&apiKey=${API_KEY}`
  );
  return res.json();
}
