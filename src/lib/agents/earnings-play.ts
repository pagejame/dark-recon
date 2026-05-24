import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAccount } from '@/lib/api/alpaca';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || '';

export interface EarningsPlay {
  ticker: string;
  earnings_date: string;
  earnings_time: 'bmo' | 'amc';
  days_until_earnings: number;
  eps_estimate: number | null;
  revenue_estimate: number | null;
  play_type: 'call' | 'put' | 'straddle' | 'stock';
  thesis: string;
  catalyst: string;
  risk_note: string;
  conviction_score: number;
  suggested_strike?: number;
  suggested_expiry?: string;
  position_size_pct: number;
  dollar_amount: number;
  entry_note: string;
}

interface EarningsCalendarEntry {
  symbol: string;
  date: string;
  hour?: string;
  epsEstimate?: number;
  revenueEstimate?: number;
}

async function getUpcomingEarnings(tickers: string[]): Promise<EarningsCalendarEntry[]> {
  const today = new Date().toISOString().split('T')[0];
  const tenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const earnings: EarningsCalendarEntry[] = [];

  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const res = await fetch(
          `https://finnhub.io/api/v1/calendar/earnings?symbol=${ticker}&from=${today}&to=${tenDays}`,
          { headers: { 'X-Finnhub-Token': FINNHUB_KEY } }
        );
        if (!res.ok) return;
        const data = await res.json();
        const results = data?.earningsCalendar || [];
        earnings.push(...results.filter((e: EarningsCalendarEntry) => e.symbol === ticker));
      } catch {
        /* skip */
      }
    })
  );

  return earnings.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

async function getCompanyFinancials(ticker: string): Promise<string> {
  try {
    const [profileRes, metricsRes] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}`, {
        headers: { 'X-Finnhub-Token': FINNHUB_KEY },
      }),
      fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all`, {
        headers: { 'X-Finnhub-Token': FINNHUB_KEY },
      }),
    ]);

    const profile = profileRes.ok ? await profileRes.json() : {};
    const metrics = metricsRes.ok ? await metricsRes.json() : {};
    const m = metrics?.metric || {};

    return `${profile.name || ticker} — ${profile.finnhubIndustry || 'Unknown'} | Market Cap: $${profile.marketCapitalization?.toFixed(0) || 'N/A'}B | P/E: ${m['peNormalizedAnnual']?.toFixed(1) || 'N/A'} | Revenue Growth YoY: ${m['revenueGrowthTTMYoy']?.toFixed(1) || 'N/A'}%`;
  } catch {
    return ticker;
  }
}

export async function buildEarningsPlays(watchlistTickers: string[]): Promise<EarningsPlay[]> {
  const supabase = createAdminClient();
  const account = await getAccount();
  const equity = parseFloat(account?.equity || '100000');

  const upcomingEarnings = await getUpcomingEarnings(watchlistTickers);

  if (upcomingEarnings.length === 0) return [];

  const today = new Date();
  const relevantEarnings = upcomingEarnings.filter((e) => {
    const earningsDate = new Date(e.date);
    const daysOut = Math.floor((earningsDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysOut >= 1 && daysOut <= 5;
  });

  if (relevantEarnings.length === 0) return [];

  const { data: existingPlays } = await supabase
    .from('trade_queue')
    .select('ticker')
    .in('status', ['pending', 'approved'])
    .gte('queued_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString());

  const alreadyQueued = (existingPlays || []).map((p: { ticker: string }) => p.ticker);

  const plays: EarningsPlay[] = [];

  for (const earning of relevantEarnings.slice(0, 3)) {
    const ticker = earning.symbol;
    if (alreadyQueued.includes(ticker)) continue;

    const earningsDate = new Date(earning.date);
    const daysOut = Math.floor((earningsDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const financials = await getCompanyFinancials(ticker);

    let analystContext = '';
    try {
      const recRes = await fetch(
        `https://finnhub.io/api/v1/stock/recommendation?symbol=${ticker}`,
        { headers: { 'X-Finnhub-Token': FINNHUB_KEY } }
      );
      if (recRes.ok) {
        const recs = await recRes.json();
        const latest = recs?.[0];
        if (latest) {
          analystContext = `Analyst: ${latest.strongBuy} strong buy, ${latest.buy} buy, ${latest.hold} hold, ${latest.sell} sell`;
        }
      }
    } catch {
      /* skip */
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `You are Dark Recon's Earnings Play Agent. Build a specific pre-earnings trade for approval.

EARNINGS EVENT:
${ticker} reports on ${earning.date} ${earning.hour === 'bmo' ? 'BEFORE MARKET OPEN' : 'AFTER MARKET CLOSE'}
Days until earnings: ${daysOut}
EPS Estimate: ${earning.epsEstimate ? '$' + earning.epsEstimate : 'N/A'}
Revenue Estimate: ${earning.revenueEstimate ? '$' + (earning.revenueEstimate / 1e9).toFixed(2) + 'B' : 'N/A'}

COMPANY:
${financials}
${analystContext}

PORTFOLIO: $${equity.toLocaleString()}
Position size budget: 2-3% of portfolio ($${(equity * 0.025).toFixed(0)})

Build a specific pre-earnings play. Consider:
- If strong beat expected: call options or long stock
- If miss likely: put options
- If uncertain: small stock position for the drift, not options
- ${daysOut} days out is ${daysOut <= 2 ? 'very close — stock only, no options due to IV crush risk' : 'good timing for options play'}

Return ONLY valid JSON:
{
  "play_type": "call",
  "thesis": "2-3 sentences on why this earnings play makes sense right now",
  "catalyst": "Specific what to watch for in the earnings report",
  "risk_note": "Primary risk and how to manage it",
  "conviction_score": 7,
  "suggested_strike_offset": 0.05,
  "suggested_dte": 14,
  "position_size_pct": 2.5,
  "entry_note": "Specific entry instruction — limit order, when to enter, what to avoid"
}`,
        },
      ],
    });

    const raw = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');

    if (start === -1 || end === -1) continue;

    try {
      const play = JSON.parse(raw.slice(start, end + 1));
      const dollarAmount = equity * (play.position_size_pct / 100);

      plays.push({
        ticker,
        earnings_date: earning.date,
        earnings_time: earning.hour === 'bmo' ? 'bmo' : 'amc',
        days_until_earnings: daysOut,
        eps_estimate: earning.epsEstimate || null,
        revenue_estimate: earning.revenueEstimate || null,
        play_type: play.play_type || 'stock',
        thesis: play.thesis || '',
        catalyst: play.catalyst || '',
        risk_note: play.risk_note || '',
        conviction_score: play.conviction_score || 7,
        position_size_pct: play.position_size_pct || 2.5,
        dollar_amount: dollarAmount,
        entry_note: play.entry_note || '',
      });
    } catch {
      /* skip malformed response */
    }
  }

  return plays;
}

export async function queueEarningsPlays(plays: EarningsPlay[]): Promise<number> {
  if (plays.length === 0) return 0;
  const supabase = createAdminClient();
  let queued = 0;

  const marketClose = new Date();
  marketClose.setHours(20, 0, 0, 0);

  for (const play of plays) {
    try {
      const { data: inserted } = await supabase
        .from('trade_queue')
        .insert({
          ticker: play.ticker,
          direction: play.play_type === 'put' ? 'short' : 'long',
          instrument_type: ['call', 'put'].includes(play.play_type) ? play.play_type : 'stock',
          entry_type: 'limit',
          position_size_pct: play.position_size_pct,
          dollar_amount: play.dollar_amount,
          stop_loss_pct: play.play_type === 'stock' ? 7 : 50,
          conviction_score: play.conviction_score,
          signal_sources: [
            `Earnings Catalyst — ${play.ticker} reports ${play.earnings_date}`,
            `EPS Estimate: $${play.eps_estimate || 'N/A'}`,
          ],
          thesis_summary: play.thesis,
          key_catalyst: play.catalyst,
          risk_note: `${play.risk_note} Entry note: ${play.entry_note}`,
          status: 'pending',
          queued_at: new Date().toISOString(),
          expires_at: marketClose.toISOString(),
        })
        .select('id')
        .single();

      await supabase.from('earnings_events').upsert(
        {
          symbol: play.ticker,
          date: play.earnings_date,
          hour: play.earnings_time,
          eps_estimate: play.eps_estimate,
          revenue_estimate: play.revenue_estimate,
          play_queued: true,
          play_queue_id: inserted?.id || null,
        },
        { onConflict: 'symbol,date' }
      );

      queued++;
    } catch (e) {
      console.error('Failed to queue earnings play:', e);
    }
  }

  return queued;
}
