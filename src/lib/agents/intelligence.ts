import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface IntelligenceSignal {
  source: string;
  signal_type: string;
  ticker?: string;
  headline: string;
  summary: string;
  url?: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  strength: 'high' | 'medium' | 'low';
  swept_at: string;
}

const WATCHLIST = ['NVDA', 'AMD', 'TSLA', 'META', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'QQQ', 'SPY', 'GM'];

const DATA_SOURCES = {
  REDDIT_WSB: 'https://www.reddit.com/r/wallstreetbets/hot.json?limit=25',
  REDDIT_STOCKS: 'https://www.reddit.com/r/stocks/hot.json?limit=25',
  REDDIT_INVESTING: 'https://www.reddit.com/r/investing/hot.json?limit=25',
};

interface RedditPostData {
  title?: string;
  selftext?: string;
  score?: number;
  num_comments?: number;
  permalink?: string;
}

interface RedditChild {
  data?: RedditPostData;
}

interface SecHitSource {
  entity_name?: string;
  company_name?: string;
  ticker_symbol?: string;
  period_of_report?: string;
  file_date?: string;
}

interface SecHit {
  _source?: SecHitSource;
}

interface FinnhubNewsItem {
  headline?: string;
  summary?: string;
  source?: string;
  url?: string;
}

interface ClaudeScore {
  index: number;
  sentiment?: 'bullish' | 'bearish' | 'neutral';
  strength?: 'high' | 'medium' | 'low';
  ticker?: string;
  ai_summary?: string;
}

async function sweepReddit(subreddit: string, url: string): Promise<IntelligenceSignal[]> {
  const signals: IntelligenceSignal[] = [];
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'DarkRecon/1.0 (financial research tool)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return signals;
    const data = await res.json();
    const posts = (data?.data?.children || []) as RedditChild[];

    const relevantPosts = posts
      .filter((p) => {
        const post = p.data;
        if (!post) return false;
        const text = (post.title + ' ' + (post.selftext || '')).toUpperCase();
        return (
          WATCHLIST.some((ticker) => text.includes(ticker)) || (post.score || 0) > 500
        );
      })
      .slice(0, 5);

    relevantPosts.forEach((p) => {
      const post = p.data!;
      const text = (post.title + ' ' + (post.selftext || '')).toUpperCase();
      const mentionedTicker = WATCHLIST.find((t) => text.includes(t));
      const score = post.score || 0;

      signals.push({
        source: `Reddit r/${subreddit}`,
        signal_type: 'social_sentiment',
        ticker: mentionedTicker,
        headline: post.title?.slice(0, 200) || '',
        summary: `${score} upvotes, ${post.num_comments || 0} comments on r/${subreddit}`,
        url: post.permalink ? `https://reddit.com${post.permalink}` : undefined,
        sentiment: 'neutral',
        strength: score > 2000 ? 'high' : score > 500 ? 'medium' : 'low',
        swept_at: new Date().toISOString(),
      });
    });
  } catch (e) {
    console.error(`Reddit sweep error for ${subreddit}:`, e);
  }
  return signals;
}

async function sweepSECFilings(): Promise<IntelligenceSignal[]> {
  const signals: IntelligenceSignal[] = [];
  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const res = await fetch(
      `https://efts.sec.gov/LATEST/search-index?forms=8-K&dateRange=custom&startdt=${yesterday}&enddt=${today}&hits.hits.total.value=true`,
      {
        headers: {
          'User-Agent': 'DarkRecon contact@dark-recon.com',
          Accept: 'application/json',
        },
      }
    );

    if (!res.ok) return signals;
    const data = await res.json();
    const hits = (data?.hits?.hits || []) as SecHit[];

    hits.slice(0, 10).forEach((hit) => {
      const source = hit._source;
      const entityName = source?.entity_name || source?.company_name || 'Unknown Company';
      const ticker = WATCHLIST.find(
        (t) =>
          entityName.toUpperCase().includes(t) ||
          (source?.ticker_symbol || '').toUpperCase() === t
      );

      signals.push({
        source: 'SEC EDGAR 8-K',
        signal_type: 'sec_filing',
        ticker,
        headline: `${entityName} filed 8-K: ${source?.period_of_report || 'Material Event'}`,
        summary: `SEC 8-K filing — material event disclosure. Filed ${source?.file_date || today}.`,
        url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(entityName)}&type=8-K&dateb=&owner=include&count=10`,
        sentiment: 'neutral',
        strength: 'medium',
        swept_at: new Date().toISOString(),
      });
    });
  } catch (e) {
    console.error('SEC filings sweep error:', e);
  }
  return signals;
}

async function sweepFinancialNews(): Promise<IntelligenceSignal[]> {
  const signals: IntelligenceSignal[] = [];
  try {
    const res = await fetch(`https://finnhub.io/api/v1/news?category=general&minId=0`, {
      headers: { 'X-Finnhub-Token': process.env.FINNHUB_API_KEY || '' },
    });
    if (!res.ok) return signals;
    const news = (await res.json()) as FinnhubNewsItem[];

    const relevant = (Array.isArray(news) ? news : [])
      .filter((n) => {
        const text = (n.headline + ' ' + (n.summary || '')).toUpperCase();
        return (
          WATCHLIST.some((t) => text.includes(t)) ||
          ['FED', 'RATE', 'INFLATION', 'RECESSION', 'EARNINGS'].some((kw) => text.includes(kw))
        );
      })
      .slice(0, 8);

    relevant.forEach((n) => {
      const text = (n.headline + ' ' + (n.summary || '')).toUpperCase();
      const ticker = WATCHLIST.find((t) => text.includes(t));

      signals.push({
        source: `Financial News — ${n.source || 'Market'}`,
        signal_type: 'financial_news',
        ticker,
        headline: n.headline?.slice(0, 200) || '',
        summary: n.summary?.slice(0, 300) || '',
        url: n.url,
        sentiment: 'neutral',
        strength: 'medium',
        swept_at: new Date().toISOString(),
      });
    });
  } catch (e) {
    console.error('Financial news sweep error:', e);
  }
  return signals;
}

const STRENGTH_ORDER: Record<IntelligenceSignal['strength'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export async function runIntelligenceSweep(): Promise<IntelligenceSignal[]> {
  const [wsbSignals, stocksSignals, investingSignals, secSignals, newsSignals] =
    await Promise.allSettled([
      sweepReddit('wallstreetbets', DATA_SOURCES.REDDIT_WSB),
      sweepReddit('stocks', DATA_SOURCES.REDDIT_STOCKS),
      sweepReddit('investing', DATA_SOURCES.REDDIT_INVESTING),
      sweepSECFilings(),
      sweepFinancialNews(),
    ]);

  const allSignals = [
    ...(wsbSignals.status === 'fulfilled' ? wsbSignals.value : []),
    ...(stocksSignals.status === 'fulfilled' ? stocksSignals.value : []),
    ...(investingSignals.status === 'fulfilled' ? investingSignals.value : []),
    ...(secSignals.status === 'fulfilled' ? secSignals.value : []),
    ...(newsSignals.status === 'fulfilled' ? newsSignals.value : []),
  ];

  if (allSignals.length === 0) return [];

  try {
    const signalContext = allSignals
      .slice(0, 20)
      .map(
        (s, i) =>
          `${i + 1}. [${s.source}] ${s.headline}${s.ticker ? ` (${s.ticker})` : ''}`
      )
      .join('\n');

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `You are Dark Recon's Intelligence Sweep Agent. Analyze these signals from across the internet and score each one for trading relevance.

SIGNALS FOUND:
${signalContext}

For each signal, determine:
1. Is this actually actionable for a stock trader?
2. What is the sentiment (bullish/bearish/neutral)?
3. What is the strength (high/medium/low)?
4. What ticker is most relevant?

Return ONLY a JSON array. No markdown. Start with [ end with ].

[
  {
    "index": 1,
    "sentiment": "bullish",
    "strength": "high",
    "ticker": "NVDA",
    "ai_summary": "One sentence actionable insight for a trader based on this signal"
  }
]

Only include signals that are genuinely actionable. Skip generic news. Focus on signals that could move a stock price in the next 1-5 days.`,
        },
      ],
    });

    const raw = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');

    if (start !== -1 && end !== -1) {
      const scored = JSON.parse(raw.slice(start, end + 1)) as ClaudeScore[];
      scored.forEach((score) => {
        const signal = allSignals[score.index - 1];
        if (signal) {
          signal.sentiment = score.sentiment || signal.sentiment;
          signal.strength = score.strength || signal.strength;
          if (score.ticker) signal.ticker = score.ticker;
          if (score.ai_summary) signal.summary = score.ai_summary;
        }
      });
    }
  } catch (e) {
    console.error('Claude scoring error:', e);
  }

  return allSignals.sort(
    (a, b) => STRENGTH_ORDER[a.strength] - STRENGTH_ORDER[b.strength]
  );
}
