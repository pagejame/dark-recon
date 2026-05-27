import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface NewsSignal {
  source: string;
  headline: string;
  url: string;
  published_at: string;
  tickers: string[];
  signal_type: 'halt' | 'regulatory' | 'earnings' | 'merger' | 'fda' | 'breaking' | 'general';
  strength: 'high' | 'medium' | 'low';
  conviction: number;
  summary: string;
}

interface RSSItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

function parseRSS(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];

  itemMatches.forEach((item) => {
    const title = item.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || '';
    const link =
      item.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1] ||
      item.match(/<guid[^>]*>([\s\S]*?)<\/guid>/)?.[1] ||
      '';
    const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '';
    const description = item.match(/<description[^>]*>([\s\S]*?)<\/description>/)?.[1] || '';

    const cleanTitle = title.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]*>/g, '').trim();
    const cleanDesc = description
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/<[^>]*>/g, '')
      .trim();

    if (cleanTitle) {
      items.push({ title: cleanTitle, link, pubDate, description: cleanDesc });
    }
  });

  return items;
}

function isRecent(pubDate: string): boolean {
  if (!pubDate) return true;
  try {
    const age = Date.now() - new Date(pubDate).getTime();
    return age < 4 * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

async function fetchNASDAQTrader(): Promise<string[]> {
  const feeds = [
    'https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts',
    'https://www.nasdaqtrader.com/rss.aspx?feed=newlisted',
  ];

  const headlines: string[] = [];

  for (const url of feeds) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DarkRecon/1.0)' },
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseRSS(xml);

      items
        .filter((item) => isRecent(item.pubDate))
        .slice(0, 5)
        .forEach((item) => {
          headlines.push(`[NASDAQ] ${item.title}`);
        });
    } catch {
      /* try next */
    }
  }

  return headlines;
}

async function fetchBenzinga(): Promise<string[]> {
  const headlines: string[] = [];
  try {
    const res = await fetch('https://www.benzinga.com/feed', {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DarkRecon/1.0)' },
    });
    if (!res.ok) return headlines;
    const xml = await res.text();
    const items = parseRSS(xml);

    const keywords = [
      'earnings',
      'fda',
      'merger',
      'acquisition',
      'guidance',
      'buyout',
      'upgrade',
      'downgrade',
      'beats',
      'misses',
      'recall',
      'approval',
      'contract',
      'partnership',
      'raises',
      'cuts',
    ];

    items
      .filter((item) => isRecent(item.pubDate))
      .filter((item) => keywords.some((k) => item.title.toLowerCase().includes(k)))
      .slice(0, 8)
      .forEach((item) => {
        headlines.push(`[Benzinga] ${item.title}`);
      });
  } catch {
    /* skip */
  }

  return headlines;
}

async function fetchYahooFinance(): Promise<string[]> {
  const headlines: string[] = [];
  const feeds = [
    'https://finance.yahoo.com/news/rssindex',
    'https://finance.yahoo.com/rss/topstories',
  ];

  for (const url of feeds) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DarkRecon/1.0)' },
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseRSS(xml);

      items
        .filter((item) => isRecent(item.pubDate))
        .slice(0, 5)
        .forEach((item) => {
          headlines.push(`[Yahoo Finance] ${item.title}`);
        });

      if (headlines.length > 0) break;
    } catch {
      /* try next */
    }
  }

  return headlines;
}

export async function scanNewsFeeds(): Promise<NewsSignal[]> {
  const signals: NewsSignal[] = [];

  const [nasdaqHeadlines, benzingaHeadlines, yahooHeadlines] = await Promise.all([
    fetchNASDAQTrader().catch(() => []),
    fetchBenzinga().catch(() => []),
    fetchYahooFinance().catch(() => []),
  ]);

  const allHeadlines = [...nasdaqHeadlines, ...benzingaHeadlines, ...yahooHeadlines];

  if (allHeadlines.length === 0) return signals;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: `Extract actionable trading signals from these news headlines.

HEADLINES:
${allHeadlines.slice(0, 20).join('\n')}

Return ONLY headlines that contain specific stock tickers with clear market impact.
Ignore: general economy, politics without stock impact, old news.
Include: earnings beats/misses, FDA decisions, M&A, halts, upgrades/downgrades, guidance changes.

Return ONLY valid JSON array (max 6 signals):
[
  {
    "source": "Benzinga",
    "headline": "exact headline",
    "tickers": ["NVDA"],
    "signal_type": "earnings",
    "strength": "high",
    "conviction": 8,
    "summary": "One line: what this means for the trade"
  }
]

If no actionable signals: []`,
        },
      ],
    });

    const raw = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('');

    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start === -1) return signals;

    const parsed = JSON.parse(raw.slice(start, end + 1)) as Array<{
      source?: string;
      headline?: string;
      tickers?: string[];
      signal_type?: NewsSignal['signal_type'];
      strength?: NewsSignal['strength'];
      conviction?: number;
      summary?: string;
    }>;

    parsed.forEach((s) => {
      if (!s.tickers?.length || !s.headline) return;
      signals.push({
        source: s.source || 'News',
        headline: s.headline,
        url: '',
        published_at: new Date().toISOString(),
        tickers: s.tickers,
        signal_type: s.signal_type || 'general',
        strength: s.strength || 'medium',
        conviction: Math.min(10, Math.max(1, s.conviction || 5)),
        summary: s.summary || s.headline,
      });
    });
  } catch (e) {
    console.error(
      'News feed signal extraction error:',
      e instanceof Error ? e.message : e
    );
  }

  return signals.filter((s) => s.conviction >= 6);
}

export async function saveNewsSignals(signals: NewsSignal[]): Promise<void> {
  if (signals.length === 0) return;

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const supabase = createAdminClient();

  for (const signal of signals) {
    for (const ticker of signal.tickers) {
      try {
        await supabase.from('signals').insert({
          ticker,
          signal_type: `news_${signal.signal_type}`,
          strength: signal.strength,
          status: 'pending',
          source: `News Feed — ${signal.source}`,
          notes: signal.summary.slice(0, 200),
          created_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error(`News signal insert error for ${ticker}:`, e);
      }
    }

    try {
      await supabase.from('intelligence_signals').insert({
        source: `news_${signal.source.toLowerCase().replace(/\s+/g, '_')}`,
        signal_type: signal.signal_type,
        strength: signal.strength,
        ticker: signal.tickers[0] || null,
        headline: signal.headline,
        summary: signal.summary,
        url: signal.url || null,
        swept_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('News intelligence_signals insert error:', e);
    }
  }
}
