import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface MorningBriefing {
  date: string;
  market_status: string;
  sentiment: 'risk_on' | 'risk_off' | 'neutral' | 'volatile';
  briefing_text: string;
  top_signals: string[];
  key_levels: { label: string; value: string; note: string }[];
  generated_at: string;
}

export async function generateMorningBriefing(): Promise<MorningBriefing> {
  const today = new Date().toDateString();
  const hour = new Date().getHours();
  const marketStatus = hour >= 9 && hour < 16 ? 'open' : 'closed';

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: `You are Dark Recon's Morning Briefing Agent. Today is ${today}. Market is currently ${marketStatus}.

Generate a sharp pre-market or current session intelligence briefing based on your knowledge of current market conditions.

Respond with a single JSON object only. No text before or after. No markdown. No code fences. Just raw JSON starting with { and ending with }.

{
  "date": "${today}",
  "market_status": "${marketStatus}",
  "sentiment": "risk_on",
  "briefing_text": "DARK RECON — ${today}\n\n[Paragraph 1: Overall market condition and what it means for today — 3-4 sentences, specific and direct]\n\n[Paragraph 2: Top 2-3 opportunities with specific tickers and setups — be actionable]\n\n[Paragraph 3: Key risks and levels to watch — what invalidates the thesis]\n\n[Paragraph 4: One clear tactical recommendation for the session]",
  "top_signals": ["NVDA +2.3%", "AMD momentum", "SPY holding 520"],
  "key_levels": [
    { "label": "SPY Support", "value": "520", "note": "Key level to hold" },
    { "label": "SPY Resistance", "value": "535", "note": "Breakout target" },
    { "label": "VIX", "value": "18", "note": "Elevated caution" },
    { "label": "10Y Yield", "value": "4.4%", "note": "Watch for moves" }
  ],
  "generated_at": "${new Date().toISOString()}"
}

Make the briefing_text sharp, direct, and specific. Like a hedge fund analyst. Use real market knowledge. No fluff.`,
      },
    ],
  });

  const rawText = message.content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { type: 'text'; text: string }).text)
    .join('');

  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    console.error('Briefing raw response:', rawText);
    throw new Error('Could not find valid JSON in briefing response');
  }

  const jsonStr = rawText.slice(start, end + 1);
  const result = JSON.parse(jsonStr) as MorningBriefing;
  return result;
}
