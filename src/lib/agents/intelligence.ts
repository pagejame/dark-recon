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

interface RedditPostData {
  title?: string;
  selftext?: string;
  score?: number;
  num_comments?: number;
  permalink?: string;
  upvote_ratio?: number;
}

interface RedditChild {
  data?: RedditPostData;
}

async function sweepReddit(subreddit: string): Promise<IntelligenceSignal[]> {
  const signals: IntelligenceSignal[] = [];

  const urls = [
    `https://old.reddit.com/r/${subreddit}/hot.json?limit=25`,
    `https://www.reddit.com/r/${subreddit}/hot.json?limit=25&raw_json=1`,
  ];

  let posts: RedditChild[] = [];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DarkReconBot/1.0; research tool)',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        signal: AbortSignal.timeout(3000),
      });

      if (!res.ok) continue;

      const text = await res.text();
      if (!text || text.trim().startsWith('<')) continue;

      const data = JSON.parse(text);
      posts = data?.data?.children || [];
      if (posts.length > 0) break;
    } catch {
      continue;
    }
  }

  if (posts.length === 0) return signals;

  const relevant = posts
    .map((p) => p.data || {})
    .filter((post) => {
      const text = ((post.title || '') + ' ' + (post.selftext || '')).toUpperCase();
      const hasWatchlistTicker = WATCHLIST.some((ticker) => {
        return new RegExp(`\\b${ticker}\\b`).test(text);
      });
      return hasWatchlistTicker || ((post.score || 0) > 500 && (post.upvote_ratio || 0) > 0.8);
    })
    .slice(0, 4);

  relevant.forEach((post) => {
    const text = ((post.title || '') + ' ' + (post.selftext || '')).toUpperCase();
    const mentionedTicker = WATCHLIST.find((t) => new RegExp(`\\b${t}\\b`).test(text));

    if (!post.title) return;

    signals.push({
      source: `Reddit r/${subreddit}`,
      signal_type: 'social_sentiment',
      ticker: mentionedTicker,
      headline: post.title.slice(0, 200),
      summary: `${(post.score || 0).toLocaleString()} upvotes · ${post.num_comments || 0} comments`,
      url: post.permalink ? `https://reddit.com${post.permalink}` : undefined,
      sentiment: 'neutral',
      strength: (post.score || 0) > 2000 ? 'high' : (post.score || 0) > 500 ? 'medium' : 'low',
      swept_at: new Date().toISOString(),
    });
  });

  return signals;
}

interface SecHitSource {
  entity_name?: string;
  company_name?: string;
  ticker_symbol?: string;
  period_of_report?: string;
  file_date?: string;
  display_names?: string[];
  form_type?: string;
  accession_no?: string;
  entity_id?: string;
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

async function sweepSECFilings(): Promise<IntelligenceSignal[]> {
  const signals: IntelligenceSignal[] = [];
  try {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const res = await fetch(
      `https://efts.sec.gov/LATEST/search-index?forms=8-K&dateRange=custom&startdt=${yesterday}&enddt=${today}`,
      {
        headers: {
          'User-Agent': 'DarkRecon research@dark-recon.com',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(3000),
      }
    );

    if (!res.ok) return signals;
    const data = await res.json();
    const hits = (data?.hits?.hits || []) as SecHit[];

    hits.slice(0, 8).forEach((hit) => {
      const src = hit._source || {};
      const entityName = src.entity_name || src.company_name || src.display_names?.[0] || '';
      const formType = src.form_type || '8-K';
      const fileDate = src.file_date || src.period_of_report || today;
      const accessionNo = src.accession_no || '';

      if (!entityName) return;

      const ticker = WATCHLIST.find(
        (t) =>
          entityName.toUpperCase().includes(t) ||
          (src.ticker_symbol || '').toUpperCase() === t
      );

      const url = accessionNo
        ? `https://www.sec.gov/Archives/edgar/data/${src.entity_id || ''}/`
        : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(entityName)}&type=8-K&dateb=&owner=include&count=10`;

      signals.push({
        source: 'SEC EDGAR 8-K',
        signal_type: 'sec_filing',
        ticker,
        headline: `${entityName} filed ${formType} — Material Event Disclosure`,
        summary: `${entityName} filed an 8-K material event report on ${fileDate}. Review for corporate actions, earnings preannouncements, or significant business changes.`,
        url,
        sentiment: 'neutral',
        strength: ticker ? 'high' : 'medium',
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
      signal: AbortSignal.timeout(3000),
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
  const sweep = async (): Promise<IntelligenceSignal[]> => {
    const [wsbSignals, stocksSignals, investingSignals, secSignals, newsSignals] =
      await Promise.allSettled([
        sweepReddit('wallstreetbets'),
        sweepReddit('stocks'),
        sweepReddit('investing'),
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
  };

  return Promise.race([
    sweep(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Intelligence sweep timeout')), 45000)
    ),
  ]).catch((e) => {
    console.error(
      'Intelligence sweep timed out:',
      e instanceof Error ? e.message : e
    );
    return [];
  });
}
