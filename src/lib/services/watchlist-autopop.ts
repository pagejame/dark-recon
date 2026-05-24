import { createAdminClient } from '@/lib/supabase/admin';
import Anthropic from '@anthropic-ai/sdk';
import { getPositions } from '@/lib/api/alpaca';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface TickerMention {
  ticker: string;
  sources: string[];
  mention_count: number;
  last_seen: string;
}

interface WatchlistRow {
  ticker: string;
}

interface PositionRow {
  ticker: string;
}

interface IntelSignalRow {
  ticker: string;
  source: string;
  swept_at: string;
}

interface ScannerSignalRow {
  ticker: string;
  signal_type: string;
  created_at: string;
}

interface AutopilotReportRow {
  top_opportunities: { ticker?: string }[] | null;
  created_at: string;
}

interface QueueHistoryRow {
  ticker: string;
  queued_at: string;
}

export async function runWatchlistAutoPop(): Promise<{ added: string[]; skipped: string[] }> {
  const supabase = createAdminClient();

  const { data: autopopSetting } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'watchlist_autopop_enabled')
    .maybeSingle();

  const autopopEnabled = autopopSetting?.value?.enabled !== false;
  if (!autopopEnabled) {
    return { added: [], skipped: [] };
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: currentWatchlist } = await supabase.from('watchlist').select('ticker');
  const watchlistTickers = new Set((currentWatchlist || []).map((w: WatchlistRow) => w.ticker));

  const { data: dbPositions } = await supabase
    .from('positions')
    .select('ticker')
    .eq('status', 'open');
  const positionTickers = new Set((dbPositions || []).map((p: PositionRow) => p.ticker));

  try {
    const alpacaPositions = await getPositions();
    (alpacaPositions || []).forEach((p: { symbol: string }) => {
      const sym = p.symbol;
      positionTickers.add(/^[A-Z]{1,6}\d{6}[CP]\d{8}$/.test(sym) ? sym.replace(/\d.*/, '') : sym);
    });
  } catch {
    // non-fatal
  }

  const tickerMentions: Record<string, TickerMention> = {};

  const addMention = (ticker: string, source: string, timestamp: string) => {
    if (!ticker || ticker.length > 5) return;
    const upper = ticker.toUpperCase();
    if (!tickerMentions[upper]) {
      tickerMentions[upper] = { ticker: upper, sources: [], mention_count: 0, last_seen: timestamp };
    }
    if (!tickerMentions[upper].sources.includes(source)) {
      tickerMentions[upper].sources.push(source);
    }
    tickerMentions[upper].mention_count++;
    if (timestamp > tickerMentions[upper].last_seen) {
      tickerMentions[upper].last_seen = timestamp;
    }
  };

  const { data: intelSignals } = await supabase
    .from('intelligence_signals')
    .select('ticker, source, swept_at, strength')
    .not('ticker', 'is', null)
    .eq('strength', 'high')
    .gte('swept_at', sevenDaysAgo);

  (intelSignals || []).forEach((s: IntelSignalRow) =>
    addMention(s.ticker, `Intelligence (${s.source})`, s.swept_at)
  );

  const { data: scannerSignals } = await supabase
    .from('signals')
    .select('ticker, signal_type, created_at, strength')
    .not('ticker', 'is', null)
    .eq('strength', 'high')
    .gte('created_at', sevenDaysAgo);

  (scannerSignals || []).forEach((s: ScannerSignalRow) =>
    addMention(s.ticker, `Scanner (${s.signal_type})`, s.created_at)
  );

  const { data: autopilotReports } = await supabase
    .from('autopilot_reports')
    .select('top_opportunities, created_at')
    .gte('created_at', sevenDaysAgo);

  (autopilotReports || []).forEach((report: AutopilotReportRow) => {
    const opps = report.top_opportunities || [];
    opps.forEach((opp) => {
      if (opp.ticker) addMention(opp.ticker, 'Autopilot Opportunity', report.created_at);
    });
  });

  const { data: queueHistory } = await supabase
    .from('trade_queue')
    .select('ticker, queued_at, conviction_score')
    .gte('queued_at', sevenDaysAgo)
    .gte('conviction_score', 8);

  (queueHistory || []).forEach((q: QueueHistoryRow) =>
    addMention(q.ticker, 'Trade Queue', q.queued_at)
  );

  const candidates = Object.values(tickerMentions)
    .filter(
      (m) =>
        m.sources.length >= 2 &&
        !watchlistTickers.has(m.ticker) &&
        !positionTickers.has(m.ticker)
    )
    .sort(
      (a, b) => b.sources.length - a.sources.length || b.mention_count - a.mention_count
    )
    .slice(0, 5);

  if (candidates.length === 0) {
    return { added: [], skipped: [] };
  }

  const added: string[] = [];
  const skipped: string[] = [];

  for (const candidate of candidates) {
    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: `Should ${candidate.ticker} be added to a trading watchlist based on this activity: ${candidate.sources.join(', ')} (${candidate.mention_count} mentions in 7 days)?

Reply ONLY with JSON: { "add": true, "reason": "one sentence why" } or { "add": false, "reason": "one sentence why not" }`,
          },
        ],
      });

      const raw = message.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('');
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');

      if (start === -1) {
        skipped.push(candidate.ticker);
        continue;
      }

      const decision = JSON.parse(raw.slice(start, end + 1)) as { add: boolean; reason: string };

      if (decision.add) {
        const { error } = await supabase.from('watchlist').insert({
          ticker: candidate.ticker,
          notes: `Auto-added: ${decision.reason} Sources: ${candidate.sources.join(', ')}`,
          added_at: new Date().toISOString(),
        });

        if (error) {
          console.error(`Watchlist insert error for ${candidate.ticker}:`, error);
          skipped.push(candidate.ticker);
        } else {
          added.push(candidate.ticker);
        }
      } else {
        skipped.push(candidate.ticker);
      }
    } catch (e) {
      console.error(`Watchlist auto-pop error for ${candidate.ticker}:`, e);
      skipped.push(candidate.ticker);
    }
  }

  const { error: cronError } = await supabase.from('cron_runs').insert({
    job_name: 'watchlist-autopop',
    status: 'success',
    results: { added, skipped, candidates: candidates.length },
    ran_at: new Date().toISOString(),
  });
  if (cronError) console.error('Watchlist autopop cron log error:', cronError);

  return { added, skipped };
}
