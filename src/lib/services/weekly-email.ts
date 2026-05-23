// REQUIRED environment variables:
// RESEND_API_KEY — from resend.com dashboard
// DARK_RECON_EMAIL — your email address to receive weekly reports
// Both must be set in Vercel Settings -> Environment Variables
//
// The from address autopilot@dark-recon.com requires dark-recon.com to be verified in Resend.
// Add Resend DNS records in Vercel DNS (same approach as Google Workspace for struksure.com).

import { Resend } from 'resend';
import Anthropic from '@anthropic-ai/sdk';
import { getAccount, getPositions, getOrders } from '@/lib/api/alpaca';
import { createAdminClient } from '@/lib/supabase/admin';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');
  return new Resend(apiKey);
}

interface EmailSettings {
  weekly_enabled?: boolean;
  email_address?: string;
}

interface AlpacaPosition {
  symbol: string;
  unrealized_plpc?: string;
}

interface AlpacaOrder {
  status: string;
  side: string;
  qty: string;
  symbol: string;
  filled_avg_price?: string;
}

interface DbSignal {
  ticker: string;
  signal_type: string;
  strength: string;
  status: string;
}

interface WeeklyEmailContent {
  subject: string;
  headline: string;
  portfolio_section: string;
  signals_section: string;
  next_week_section: string;
  action_items: string[];
  market_outlook: string;
}

async function getEmailSettings(): Promise<EmailSettings> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase.from('settings').select('value').eq('key', 'email').maybeSingle();
    return (data?.value as EmailSettings) || {};
  } catch {
    return {};
  }
}

async function resolveRecipient(override?: string): Promise<string> {
  if (override?.trim()) return override.trim();
  const settings = await getEmailSettings();
  if (settings.email_address?.trim()) return settings.email_address.trim();
  return process.env.DARK_RECON_EMAIL || 'james@dark-recon.com';
}

export async function generateAndSendWeeklyEmail(options?: {
  recipient?: string;
  force?: boolean;
}): Promise<{ success: boolean; message: string }> {
  try {
    const emailSettings = await getEmailSettings();
    if (!options?.force && emailSettings.weekly_enabled === false) {
      return { success: false, message: 'Weekly email disabled in settings' };
    }

    const recipient = await resolveRecipient(options?.recipient);

    const [accountResult, positionsResult, ordersResult] = await Promise.allSettled([
      getAccount(),
      getPositions(),
      getOrders('all', 50),
    ]);

    const account =
      accountResult.status === 'fulfilled'
        ? (accountResult.value as { equity?: string; last_equity?: string })
        : null;
    const positions =
      positionsResult.status === 'fulfilled'
        ? (positionsResult.value as AlpacaPosition[])
        : [];
    const orders =
      ordersResult.status === 'fulfilled' ? (ordersResult.value as AlpacaOrder[]) : [];

    const supabase = createAdminClient();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: signals } = await supabase
      .from('signals')
      .select('*')
      .gte('created_at', weekAgo)
      .order('created_at', { ascending: false });

    const equity = parseFloat(account?.equity || '100000');
    const lastEquity = parseFloat(account?.last_equity || '100000');
    const weekPnL = equity - 100000;
    const dayPnL = equity - lastEquity;

    const positionsContext =
      positions
        .map((p) => {
          const pnlPct = parseFloat(p.unrealized_plpc || '0') * 100;
          return `${p.symbol}: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`;
        })
        .join(', ') || 'No open positions';

    const weekOrdersContext =
      orders
        .filter((o) => o.status === 'filled')
        .slice(0, 5)
        .map((o) => `${o.side.toUpperCase()} ${o.qty} ${o.symbol} @ $${o.filled_avg_price}`)
        .join('\n') || 'No trades this week';

    const signalContext =
      ((signals || []) as DbSignal[])
        .filter((s) => s.strength === 'high')
        .slice(0, 5)
        .map((s) => `${s.ticker}: ${s.signal_type} (${s.status})`)
        .join('\n') || 'No high conviction signals';

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `You are Dark Recon generating a weekly performance email. Today is ${new Date().toDateString()}.

WEEK IN NUMBERS:
Portfolio Value: $${equity.toLocaleString()}
Week P&L: ${weekPnL >= 0 ? '+' : ''}$${weekPnL.toFixed(2)}
Day P&L: ${dayPnL >= 0 ? '+' : ''}$${dayPnL.toFixed(2)}
Open Positions: ${positionsContext}

TRADES THIS WEEK:
${weekOrdersContext}

HIGH CONVICTION SIGNALS:
${signalContext}

Write a sharp, concise weekly performance email. Return ONLY valid JSON:
{
  "subject": "Dark Recon Weekly — Week of [date]",
  "headline": "One sentence performance summary",
  "portfolio_section": "2-3 sentences on portfolio performance this week",
  "signals_section": "2-3 sentences on what signals fired and which were right",
  "next_week_section": "2-3 sentences on what to watch next week — specific catalysts, earnings, levels",
  "action_items": ["Action 1", "Action 2", "Action 3"],
  "market_outlook": "One sentence market outlook for next week"
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
    const content = JSON.parse(raw.slice(start, end + 1)) as WeeklyEmailContent;

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${content.subject}</title>
</head>
<body style="margin:0;padding:0;background:#080a0f;font-family:'DM Sans',system-ui,sans-serif;color:#e8edf5;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">

  <div style="border-bottom:1px solid #1e2a3a;padding-bottom:20px;margin-bottom:30px;">
    <div style="font-family:monospace;font-size:10px;letter-spacing:4px;color:#00ff88;margin-bottom:8px;">◆ DARK RECON</div>
    <h1 style="font-size:24px;font-weight:800;color:#e8edf5;margin:0 0 8px;">${content.headline}</h1>
    <div style="font-family:monospace;font-size:11px;color:#7a8fa8;">${new Date().toDateString()}</div>
  </div>

  <div style="background:#111620;border:1px solid #1e2a3a;border-left:3px solid #00ff88;border-radius:8px;padding:20px;margin-bottom:20px;">
    <div style="font-family:monospace;font-size:9px;letter-spacing:3px;color:#00ff88;margin-bottom:12px;">PORTFOLIO</div>
    <div style="font-family:monospace;font-size:28px;font-weight:700;color:#e8edf5;margin-bottom:8px;">$${equity.toLocaleString()}</div>
    <div style="font-family:monospace;font-size:14px;color:${weekPnL >= 0 ? '#00ff88' : '#ff3d5a'};margin-bottom:16px;">
      ${weekPnL >= 0 ? '+' : ''}$${weekPnL.toFixed(2)} total return
    </div>
    <p style="font-size:14px;color:#7a8fa8;line-height:1.7;margin:0;">${content.portfolio_section}</p>
  </div>

  <div style="background:#111620;border:1px solid #1e2a3a;border-left:3px solid #3d9aff;border-radius:8px;padding:20px;margin-bottom:20px;">
    <div style="font-family:monospace;font-size:9px;letter-spacing:3px;color:#3d9aff;margin-bottom:12px;">SIGNAL INTELLIGENCE</div>
    <p style="font-size:14px;color:#7a8fa8;line-height:1.7;margin:0;">${content.signals_section}</p>
  </div>

  <div style="background:#111620;border:1px solid #1e2a3a;border-left:3px solid #ffd700;border-radius:8px;padding:20px;margin-bottom:20px;">
    <div style="font-family:monospace;font-size:9px;letter-spacing:3px;color:#ffd700;margin-bottom:12px;">NEXT WEEK</div>
    <p style="font-size:14px;color:#7a8fa8;line-height:1.7;margin:0 0 16px;">${content.next_week_section}</p>
    <div style="font-family:monospace;font-size:10px;color:#7a8fa8;margin-bottom:8px;">ACTION ITEMS:</div>
    ${content.action_items
      .map(
        (item) => `
      <div style="display:flex;gap:8px;font-size:13px;color:#e8edf5;margin-bottom:6px;">
        <span style="color:#00ff88;">▸</span>${item}
      </div>
    `
      )
      .join('')}
  </div>

  <div style="background:#111620;border:1px solid #1e2a3a;border-radius:8px;padding:16px;margin-bottom:30px;">
    <div style="font-family:monospace;font-size:9px;letter-spacing:3px;color:#7a8fa8;margin-bottom:8px;">MARKET OUTLOOK</div>
    <p style="font-size:14px;color:#e8edf5;margin:0;font-style:italic;">${content.market_outlook}</p>
  </div>

  <div style="border-top:1px solid #1e2a3a;padding-top:20px;text-align:center;">
    <div style="font-family:monospace;font-size:9px;color:#3d5068;letter-spacing:2px;">
      DARK RECON · AI TRADING INTELLIGENCE · dark-recon.com
    </div>
  </div>

</div>
</body>
</html>`;

    const { error } = await getResendClient().emails.send({
      from: 'Dark Recon <autopilot@dark-recon.com>',
      to: recipient,
      subject: content.subject,
      html,
    });

    if (error) throw new Error(error.message);

    return { success: true, message: `Weekly email sent to ${recipient}` };
  } catch (error) {
    console.error('Weekly email error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Email failed',
    };
  }
}
