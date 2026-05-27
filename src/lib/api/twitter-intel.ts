import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const MARKET_ACCOUNTS = [
  'DeItaone',
  'unusual_whales',
  'nicktimairaos',
  'EarningsWhispers',
  'WallStJesus',
  'OptionsSwing',
  'zerohedge',
  'lisaabramowicz1',
  'biancoresearch',
  'elonmusk',
  'satyanadella',
  'fundstrat',
  'bespokeinvest',
  'sentimentrader',
  'Dark_Reconn',
];

export interface TwitterSignal {
  account: string;
  tweet: string;
  posted_at: string;
  tickers: string[];
  signal_type:
    | 'bullish'
    | 'bearish'
    | 'neutral'
    | 'breaking_news'
    | 'options_flow'
    | 'fed_intel';
  strength: 'high' | 'medium' | 'low';
  conviction: number;
  summary: string;
}

const NITTER_INSTANCES = [
  'https://nitter.privacydev.net',
  'https://nitter.poast.org',
  'https://nitter.1d4.us',
];

function cleanTweetText(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchAccountTweets(account: string): Promise<string[]> {
  for (const instance of NITTER_INSTANCES) {
    try {
      const res = await fetch(`${instance}/${account}/rss`, {
        signal: AbortSignal.timeout(5000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DarkRecon/1.0)',
        },
      });

      if (!res.ok) continue;
      const xml = await res.text();

      const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
      const tweets: string[] = [];

      items.slice(0, 5).forEach((item) => {
        const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/);
        const descMatch = item.match(/<description>([\s\S]*?)<\/description>/);
        const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

        const text = titleMatch?.[1] || descMatch?.[1] || '';
        const pubDate = pubDateMatch?.[1] || new Date().toISOString();

        const tweetAge = Date.now() - new Date(pubDate).getTime();
        if (tweetAge < 4 * 60 * 60 * 1000 && text.length > 10) {
          const cleaned = cleanTweetText(text);
          if (cleaned) tweets.push(`[${account}] ${cleaned}`);
        }
      });

      if (tweets.length > 0) return tweets;
    } catch {
      /* try next instance */
    }
  }
  return [];
}

export async function scanTwitterIntelligence(): Promise<TwitterSignal[]> {
  const signals: TwitterSignal[] = [];
  const batchSize = 5;
  const allTweets: string[] = [];

  for (let i = 0; i < MARKET_ACCOUNTS.length; i += batchSize) {
    const batch = MARKET_ACCOUNTS.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((account) => fetchAccountTweets(account)));
    batchResults.forEach((tweets) => allTweets.push(...tweets));
    if (i + batchSize < MARKET_ACCOUNTS.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  if (allTweets.length === 0) return signals;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content: `Analyze these recent tweets from market intelligence accounts and extract actionable trading signals.

TWEETS (last 4 hours):
${allTweets.slice(0, 20).join('\n')}

Extract ONLY tweets that contain:
- Specific stock tickers with bullish/bearish sentiment
- Breaking news that could move a stock
- Options flow or unusual activity
- Fed/macro news that affects markets
- Congressional stock purchases
- Earnings surprises or guidance changes

Ignore: general market commentary, opinions without specific tickers, old news

Return ONLY valid JSON array (max 8 signals):
[
  {
    "account": "DeItaone",
    "tweet": "original tweet text",
    "tickers": ["NVDA", "AMD"],
    "signal_type": "breaking_news",
    "strength": "high",
    "conviction": 8,
    "summary": "One line: what this means for the trade"
  }
]

If no actionable signals found, return empty array: []`,
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

    let parsed: Array<{
      account?: string;
      tweet?: string;
      tickers?: string[];
      signal_type?: TwitterSignal['signal_type'];
      strength?: TwitterSignal['strength'];
      conviction?: number;
      summary?: string;
    }> = [];

    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch (parseError) {
      console.error('Twitter signal JSON parse error:', parseError);
      return signals;
    }

    if (!Array.isArray(parsed)) return signals;

    parsed.forEach((s) => {
      if (!s.account || !s.tickers?.length) return;
      signals.push({
        account: s.account,
        tweet: s.tweet || '',
        posted_at: new Date().toISOString(),
        tickers: s.tickers,
        signal_type: s.signal_type || 'neutral',
        strength: s.strength || 'low',
        conviction: s.conviction || 5,
        summary: s.summary || '',
      });
    });
  } catch (e) {
    console.error(
      'Twitter signal extraction error:',
      e instanceof Error ? e.message : e
    );
  }

  return signals.filter((s) => s.conviction >= 6);
}

export async function saveTwitterSignals(signals: TwitterSignal[]): Promise<void> {
  if (signals.length === 0) return;

  const { createAdminClient } = await import('@/lib/supabase/admin');
  const supabase = createAdminClient();

  for (const signal of signals) {
    for (const ticker of signal.tickers) {
      try {
        await supabase.from('signals').insert({
          ticker,
          signal_type: `twitter_${signal.signal_type}`,
          strength: signal.strength,
          status: 'pending',
          source: `Twitter @${signal.account}`,
          notes: signal.summary,
          created_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error(`Twitter signal insert error for ${ticker}:`, e);
      }
    }

    try {
      await supabase.from('intelligence_signals').insert({
        source: `twitter_${signal.account}`,
        signal_type: signal.signal_type,
        strength: signal.strength,
        ticker: signal.tickers[0] || null,
        headline: signal.summary,
        summary: signal.summary,
        url: `https://twitter.com/${signal.account}`,
        swept_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error(`Twitter intelligence_signals insert error:`, e);
    }
  }
}
