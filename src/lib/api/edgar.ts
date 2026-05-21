const EDGAR_BASE = 'https://data.sec.gov';
const HEADERS = { 'User-Agent': 'DarkRecon contact@darkrecon.app' };

export async function getCIKByTicker(ticker: string): Promise<string | null> {
  try {
    await fetch(`${EDGAR_BASE}/submissions/CIK0000000000.json`, { headers: HEADERS });
    await fetch(
      `https://efts.sec.gov/LATEST/search-index?q=%22${ticker}%22&dateRange=custom&startdt=${getDateDaysAgo(7)}&enddt=${getToday()}&forms=4`,
      { headers: HEADERS }
    );
    return null;
  } catch {
    return null;
  }
}

export async function getRecentForm4Filings(limit = 20) {
  try {
    const today = getToday();
    const weekAgo = getDateDaysAgo(7);
    const res = await fetch(
      `https://efts.sec.gov/LATEST/search-index?forms=4&dateRange=custom&startdt=${weekAgo}&enddt=${today}&hits.hits._source=period_of_report,entity_name,file_date,form_type`,
      { headers: HEADERS }
    );
    const data = await res.json();
    return data?.hits?.hits?.slice(0, limit) || [];
  } catch {
    return [];
  }
}

export async function getFilingsByCIK(cik: string) {
  try {
    const paddedCIK = cik.padStart(10, '0');
    const res = await fetch(
      `${EDGAR_BASE}/submissions/CIK${paddedCIK}.json`,
      { headers: HEADERS }
    );
    return res.json();
  } catch {
    return null;
  }
}

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}
