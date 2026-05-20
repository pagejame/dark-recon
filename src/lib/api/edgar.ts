import axios from 'axios';

const EDGAR_BASE = 'https://efts.sec.gov/LATEST/search-index';

export async function searchFilings(query: string) {
  const { data } = await axios.get(`${EDGAR_BASE}`, {
    params: { q: query },
    headers: { 'User-Agent': 'DarkRecon/1.0 (contact@darkrecon.app)' },
  });
  return data;
}
