import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';

async function getFinnhubData(ticker: string): Promise<string> {
  try {
    const fromDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];

    const [profileRes, metricsRes, newsRes] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}`, {
        headers: { 'X-Finnhub-Token': FINNHUB_KEY },
      }),
      fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all`, {
        headers: { 'X-Finnhub-Token': FINNHUB_KEY },
      }),
      fetch(
        `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${fromDate}&to=${toDate}`,
        { headers: { 'X-Finnhub-Token': FINNHUB_KEY } }
      ),
    ]);

    const profile = profileRes.ok ? await profileRes.json() : {};
    const metrics = metricsRes.ok ? await metricsRes.json() : {};
    const news = newsRes.ok ? await newsRes.json() : [];
    const m = metrics?.metric || {};

    const recentNews = (Array.isArray(news) ? news : [])
      .slice(0, 3)
      .map((n: { headline?: string }) => n.headline)
      .join('; ');

    return `${profile.name || ticker} | ${profile.finnhubIndustry || 'Unknown'} | Cap: $${(profile.marketCapitalization || 0).toFixed(0)}B | P/E: ${m.peNormalizedAnnual?.toFixed(1) || 'N/A'} | 52W High: $${m['52WeekHigh'] || 'N/A'} | 52W Low: $${m['52WeekLow'] || 'N/A'} | Recent: ${recentNews || 'No recent news'}`;
  } catch {
    return ticker;
  }
}

export interface AutoThesis {
  ticker: string;
  thesis: string;
  catalyst: string;
  risk_note: string;
  conviction_score: number;
  entry_note: string;
  signal_summary: string;
}

export async function buildAutoThesis(
  ticker: string,
  signalSummary: string,
  sources: string[]
): Promise<AutoThesis | null> {
  try {
    const supabase = createAdminClient();
    const today = new Date().toISOString().split('T')[0];
    const { data: existing } = await supabase
      .from('theses')
      .select('*')
      .eq('ticker', ticker)
      .gte('created_at', `${today}T00:00:00Z`)
      .maybeSingle();

    if (existing) {
      const thesisData = (existing.thesis_data || {}) as Record<string, string | number>;
      return {
        ticker,
        thesis:
          (existing.thesis as string) ||
          (thesisData.thesis as string) ||
          '',
        catalyst:
          (existing.catalyst as string) ||
          (thesisData.catalyst as string) ||
          '',
        risk_note:
          (existing.risk_note as string) ||
          (thesisData.risk_note as string) ||
          '',
        conviction_score: existing.conviction_score || 7,
        entry_note:
          (existing.entry_note as string) ||
          (thesisData.entry_note as string) ||
          '',
        signal_summary: signalSummary,
      };
    }

    const fundamentals = await getFinnhubData(ticker);

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: `You are Dark Recon's automated thesis builder. Build a concise trade thesis for ${ticker}.

SIGNAL SUMMARY: ${signalSummary}
CONFIRMING SOURCES: ${sources.join(', ')}
FUNDAMENTALS: ${fundamentals}

Return ONLY valid JSON:
{
  "thesis": "2 sentences max — why this trade makes sense right now",
  "catalyst": "The specific event or trend driving this",
  "risk_note": "Primary risk in one sentence",
  "conviction_score": 7,
  "entry_note": "Specific entry instruction — limit or market, any conditions",
  "verdict": "BUY" or "PASS"
}`,
        },
      ],
    });

    const raw = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1) return null;

    const result = JSON.parse(raw.slice(start, end + 1)) as {
      thesis?: string;
      catalyst?: string;
      risk_note?: string;
      conviction_score?: number;
      entry_note?: string;
      verdict?: string;
    };

    if (result.verdict === 'PASS') return null;

    const autoThesis: AutoThesis = {
      ticker,
      thesis: result.thesis || '',
      catalyst: result.catalyst || '',
      risk_note: result.risk_note || '',
      conviction_score: result.conviction_score || 7,
      entry_note: result.entry_note || '',
      signal_summary: signalSummary,
    };

    const { error: insertError } = await supabase.from('theses').insert({
      ticker,
      thesis: autoThesis.thesis,
      catalyst: autoThesis.catalyst || null,
      risk_note: autoThesis.risk_note || null,
      conviction_score: autoThesis.conviction_score,
      entry_note: autoThesis.entry_note || null,
      signal_sources: sources,
      auto_generated: true,
      created_at: new Date().toISOString(),
    });
    if (insertError) {
      console.error(`Thesis insert failed for ${ticker}:`, insertError.message);
    }

    try {
      await supabase
        .from('watchlist')
        .update({ notes: `Auto-thesis: ${autoThesis.thesis}` })
        .eq('ticker', ticker);
    } catch {
      /* watchlist entry may not exist */
    }

    return autoThesis;
  } catch (e) {
    console.error(
      `Auto-thesis failed for ${ticker}:`,
      e instanceof Error ? e.message : e
    );
    return null;
  }
}

export async function buildThesesForConfirmedSignals(
  confirmedSignals: Array<{
    ticker: string;
    best_reason: string;
    sources: string[];
    confirmation_score: number;
  }>
): Promise<AutoThesis[]> {
  const theses: AutoThesis[] = [];
  const toProcess = confirmedSignals
    .filter((s) => s.confirmation_score >= 6)
    .slice(0, 5);

  for (const signal of toProcess) {
    const thesis = await buildAutoThesis(signal.ticker, signal.best_reason, signal.sources);
    if (thesis) theses.push(thesis);
    await new Promise((r) => setTimeout(r, 300));
  }

  return theses;
}
