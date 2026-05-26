import { getPositions } from '@/lib/api/alpaca';
import { createAdminClient } from '@/lib/supabase/admin';

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';
const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 500;

export interface PositionNewsAlert {
  ticker: string;
  headline: string;
  summary: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  urgency: 'high' | 'medium' | 'low';
  url: string;
  published_at: string;
}

const NEGATIVE_KEYWORDS = [
  'downgrade',
  'miss',
  'warning',
  'cut',
  'recall',
  'investigation',
  'lawsuit',
  'fine',
  'fraud',
  'layoff',
  'guidance cut',
  'below expectations',
  'disappoints',
];
const POSITIVE_KEYWORDS = [
  'upgrade',
  'beat',
  'raised',
  'outperform',
  'buy rating',
  'record',
  'partnership',
  'contract',
  'approval',
  'exceeds',
  'strong',
  'bullish',
];

const OCC_SYMBOL = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/;

interface FinnhubNewsItem {
  datetime: number;
  headline?: string;
  summary?: string;
  url?: string;
}

function detectSentiment(text: string): {
  sentiment: 'positive' | 'negative' | 'neutral';
  urgency: 'high' | 'medium' | 'low';
} {
  const lower = text.toLowerCase();
  const hasNegative = NEGATIVE_KEYWORDS.some((kw) => lower.includes(kw));
  const hasPositive = POSITIVE_KEYWORDS.some((kw) => lower.includes(kw));

  if (hasNegative && !hasPositive) {
    return { sentiment: 'negative', urgency: 'high' };
  }
  if (hasPositive && !hasNegative) {
    return { sentiment: 'positive', urgency: 'medium' };
  }
  return { sentiment: 'neutral', urgency: 'low' };
}

async function fetchTickerNews(
  ticker: string,
  since: number
): Promise<PositionNewsAlert[]> {
  const alerts: PositionNewsAlert[] = [];

  try {
    const fromDate = new Date(since * 1000).toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];

    const res = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${fromDate}&to=${toDate}`,
      {
        headers: { 'X-Finnhub-Token': FINNHUB_KEY },
        signal: AbortSignal.timeout(4000),
      }
    );

    if (!res.ok) {
      console.error(`Position news fetch failed for ${ticker}: HTTP ${res.status}`);
      return alerts;
    }

    const news = (await res.json()) as FinnhubNewsItem[];

    (Array.isArray(news) ? news : [])
      .filter((n) => n.datetime >= since)
      .slice(0, 3)
      .forEach((n) => {
        const text = (n.headline || '') + ' ' + (n.summary || '');
        const { sentiment, urgency } = detectSentiment(text);

        if (sentiment === 'neutral' && urgency === 'low') return;

        alerts.push({
          ticker,
          headline: n.headline?.slice(0, 200) || '',
          summary: n.summary?.slice(0, 300) || '',
          sentiment,
          urgency,
          url: n.url || '',
          published_at: new Date(n.datetime * 1000).toISOString(),
        });
      });
  } catch (e) {
    console.error(
      `Position news fetch failed for ${ticker}:`,
      e instanceof Error ? e.message : e
    );
  }

  return alerts;
}

export async function scanPositionNews(): Promise<PositionNewsAlert[]> {
  const positions = await getPositions();
  if (!positions || positions.length === 0) return [];

  const tickers = (positions as { symbol: string }[])
    .map((p) => {
      const symbol = p.symbol;
      return OCC_SYMBOL.test(symbol) ? symbol.replace(/\d.*/, '') : symbol;
    })
    .filter((t, i, arr) => arr.indexOf(t) === i);

  const alerts: PositionNewsAlert[] = [];
  const supabase = createAdminClient();

  const { data: lastRun } = await supabase
    .from('cron_runs')
    .select('ran_at')
    .eq('job_name', 'position-news')
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const since = lastRun
    ? Math.floor(new Date(lastRun.ran_at).getTime() / 1000)
    : Math.floor((Date.now() - 2 * 60 * 60 * 1000) / 1000);

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((ticker) => fetchTickerNews(ticker, since))
    );
    batchResults.forEach((tickerAlerts) => alerts.push(...tickerAlerts));

    if (i + BATCH_SIZE < tickers.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  for (const alert of alerts.filter((a) => a.urgency === 'high')) {
    try {
      await supabase.from('position_alerts').insert({
        ticker: alert.ticker,
        alert_type: 'drawdown_warning',
        message: `📰 ${alert.sentiment.toUpperCase()} NEWS: ${alert.headline}`,
        severity: alert.sentiment === 'negative' ? 'critical' : 'warning',
        current_price: null,
        status: 'active',
        fired_at: new Date().toISOString(),
      });
    } catch {
      // skip duplicates
    }
  }

  return alerts.sort((a, b) => {
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
  });
}
