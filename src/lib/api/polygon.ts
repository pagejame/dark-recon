import axios from 'axios';

const POLYGON_BASE = 'https://api.polygon.io';

export async function getTickerSnapshot(ticker: string) {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) throw new Error('POLYGON_API_KEY is not configured');

  const { data } = await axios.get(`${POLYGON_BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, {
    params: { apiKey },
  });
  return data;
}
