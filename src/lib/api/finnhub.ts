const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const API_KEY = process.env.FINNHUB_API_KEY;

export interface EarningsCalendarEvent {
  symbol: string;
  date: string;
  hour?: string;
  epsEstimate?: number | null;
  epsActual?: number | null;
  revenueEstimate?: number | null;
  revenueActual?: number | null;
  quarter?: number;
  year?: number;
}

function finnhubHeaders() {
  return {
    'X-Finnhub-Token': API_KEY || '',
    'Content-Type': 'application/json',
  };
}

function getDateRange(daysAhead = 7) {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + daysAhead);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

export async function getEarningsCalendar(daysAhead = 7) {
  const { from, to } = getDateRange(daysAhead);
  const res = await fetch(
    `${FINNHUB_BASE}/calendar/earnings?from=${from}&to=${to}`,
    { headers: finnhubHeaders() }
  );
  if (!res.ok) throw new Error(`Finnhub earnings error: ${res.status}`);
  const data = await res.json();
  return data.earningsCalendar || [];
}

export async function getSymbolEarnings(symbol: string) {
  const res = await fetch(
    `${FINNHUB_BASE}/stock/earnings?symbol=${symbol}&limit=4`,
    { headers: finnhubHeaders() }
  );
  if (!res.ok) throw new Error(`Finnhub symbol earnings error: ${res.status}`);
  return res.json();
}

export async function getCompanyNews(symbol: string, daysBack = 7) {
  const to = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];
  const res = await fetch(
    `${FINNHUB_BASE}/company-news?symbol=${symbol}&from=${from}&to=${to}`,
    { headers: finnhubHeaders() }
  );
  if (!res.ok) throw new Error(`Finnhub news error: ${res.status}`);
  return res.json();
}

export async function getBasicFinancials(symbol: string) {
  const res = await fetch(
    `${FINNHUB_BASE}/stock/metric?symbol=${symbol}&metric=all`,
    { headers: finnhubHeaders() }
  );
  if (!res.ok) throw new Error(`Finnhub financials error: ${res.status}`);
  return res.json();
}

export async function getCompanyProfile(symbol: string) {
  const res = await fetch(
    `${FINNHUB_BASE}/stock/profile2?symbol=${symbol}`,
    { headers: finnhubHeaders() }
  );
  if (!res.ok) throw new Error(`Finnhub profile error: ${res.status}`);
  return res.json();
}

export async function getInsiderTransactions(symbol: string) {
  const res = await fetch(
    `${FINNHUB_BASE}/stock/insider-transactions?symbol=${symbol}`,
    { headers: finnhubHeaders() }
  );
  if (!res.ok) throw new Error(`Finnhub insider error: ${res.status}`);
  return res.json();
}

export async function getRecommendationTrends(symbol: string) {
  const res = await fetch(
    `${FINNHUB_BASE}/stock/recommendation?symbol=${symbol}`,
    { headers: finnhubHeaders() }
  );
  if (!res.ok) throw new Error(`Finnhub recommendations error: ${res.status}`);
  return res.json();
}

export function formatEarningsContext(events: EarningsCalendarEvent[]): string {
  if (!events.length) return 'None scheduled in the next few days.';
  return events
    .map((e) => {
      const date = new Date(`${e.date}T00:00:00`);
      const dayStr = date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      const timing =
        e.hour === 'bmo' ? 'pre-market' : e.hour === 'amc' ? 'after-close' : 'TBD';
      return `${e.symbol} reports ${dayStr} ${timing}`;
    })
    .join(', ');
}
