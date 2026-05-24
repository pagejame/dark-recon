import { Resend } from 'resend';
import { getAccount, getPositions } from '@/lib/api/alpaca';
import { createAdminClient } from '@/lib/supabase/admin';

const RECIPIENT_EMAIL = process.env.DARK_RECON_EMAIL || 'pagejame@gmail.com';

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');
  return new Resend(apiKey);
}

interface AlpacaPositionRow {
  symbol: string;
  qty?: string;
  current_price?: string;
  unrealized_plpc?: string;
  unrealized_pl?: string;
}

export async function sendDailyPnLSummary(): Promise<{ success: boolean; message: string }> {
  try {
    const [account, positions] = await Promise.all([getAccount(), getPositions()]);

    if (!account) throw new Error('Could not fetch account data');

    const equity = parseFloat(account.equity || '0');
    const lastEquity = parseFloat(account.last_equity || equity.toString());
    const dayPnL = equity - lastEquity;
    const dayPnLPct = (dayPnL / lastEquity) * 100;
    const totalPnL = equity - 100000;
    const totalPnLPct = (totalPnL / 100000) * 100;

    const isPositiveDay = dayPnL >= 0;
    const dayColor = isPositiveDay ? '#00ff88' : '#ff3d5a';
    const dayEmoji = isPositiveDay ? '📈' : '📉';

    const positionRows = (Array.isArray(positions) ? positions : [])
      .map((p: AlpacaPositionRow) => {
        const pnlPct = parseFloat(p.unrealized_plpc || '0') * 100;
        const pnlDollar = parseFloat(p.unrealized_pl || '0');
        return `
        <tr>
          <td style="padding: 8px 12px; font-family: monospace; color: #ffd700; font-weight: 700;">${p.symbol}</td>
          <td style="padding: 8px 12px; font-family: monospace; color: #e8edf5;">${p.qty} shares</td>
          <td style="padding: 8px 12px; font-family: monospace; color: #e8edf5;">$${parseFloat(p.current_price || '0').toFixed(2)}</td>
          <td style="padding: 8px 12px; font-family: monospace; color: ${pnlPct >= 0 ? '#00ff88' : '#ff3d5a'};">
            ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% ($${pnlDollar >= 0 ? '+' : ''}${pnlDollar.toFixed(0)})
          </td>
        </tr>`;
      })
      .join('');

    const subject = `${dayEmoji} Dark Recon EOD: ${dayPnL >= 0 ? '+' : ''}$${dayPnL.toFixed(2)} today · $${equity.toLocaleString()} total`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#080a0f;font-family:'DM Sans',system-ui,sans-serif;color:#e8edf5;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">

  <div style="font-family:monospace;font-size:9px;letter-spacing:4px;color:#00ff88;margin-bottom:6px;">◆ DARK RECON</div>
  <h1 style="font-size:20px;font-weight:800;color:#e8edf5;margin:0 0 4px;">End of Day Report</h1>
  <div style="font-family:monospace;font-size:10px;color:#7a8fa8;margin-bottom:24px;">${new Date().toDateString()}</div>

  <div style="background:#111620;border:1px solid #1e2a3a;border-left:3px solid ${dayColor};border-radius:10px;padding:20px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
    <div>
      <div style="font-family:monospace;font-size:8px;letter-spacing:3px;color:#7a8fa8;margin-bottom:6px;">TODAY'S P&L</div>
      <div style="font-family:monospace;font-size:32px;font-weight:700;color:${dayColor};">
        ${dayPnL >= 0 ? '+' : ''}$${dayPnL.toFixed(2)}
      </div>
      <div style="font-family:monospace;font-size:12px;color:${dayColor};">
        ${dayPnLPct >= 0 ? '+' : ''}${dayPnLPct.toFixed(2)}% today
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-family:monospace;font-size:8px;letter-spacing:3px;color:#7a8fa8;margin-bottom:6px;">PORTFOLIO VALUE</div>
      <div style="font-family:monospace;font-size:24px;font-weight:700;color:#e8edf5;">$${equity.toLocaleString()}</div>
      <div style="font-family:monospace;font-size:11px;color:${totalPnL >= 0 ? '#00ff88' : '#ff3d5a'};">
        ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)} total (${totalPnLPct >= 0 ? '+' : ''}${totalPnLPct.toFixed(2)}%)
      </div>
    </div>
  </div>

  ${
    positionRows
      ? `
  <div style="background:#111620;border:1px solid #1e2a3a;border-radius:10px;overflow:hidden;margin-bottom:16px;">
    <div style="padding:12px 16px;border-bottom:1px solid #1e2a3a;font-family:monospace;font-size:8px;letter-spacing:3px;color:#7a8fa8;">OPEN POSITIONS</div>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#0d1117;">
          <th style="padding:8px 12px;font-family:monospace;font-size:8px;letter-spacing:1px;color:#3d5068;text-align:left;">TICKER</th>
          <th style="padding:8px 12px;font-family:monospace;font-size:8px;letter-spacing:1px;color:#3d5068;text-align:left;">QTY</th>
          <th style="padding:8px 12px;font-family:monospace;font-size:8px;letter-spacing:1px;color:#3d5068;text-align:left;">PRICE</th>
          <th style="padding:8px 12px;font-family:monospace;font-size:8px;letter-spacing:1px;color:#3d5068;text-align:left;">P&L</th>
        </tr>
      </thead>
      <tbody>${positionRows}</tbody>
    </table>
  </div>`
      : ''
  }

  <div style="background:#111620;border:1px solid #1e2a3a;border-radius:10px;padding:16px;margin-bottom:24px;">
    <div style="font-family:monospace;font-size:8px;letter-spacing:3px;color:#3d9aff;margin-bottom:10px;">TOMORROW</div>
    <div style="font-size:13px;color:#7a8fa8;line-height:1.6;">
      Dark Recon morning brief fires at <strong style="color:#e8edf5;">6AM ET</strong>.
      Trade queue builds automatically. Check <strong style="color:#e8edf5;">/queue</strong> before market open.
    </div>
  </div>

  <div style="text-align:center;font-family:monospace;font-size:8px;color:#3d5068;letter-spacing:2px;">
    DARK RECON ALPHA · dark-recon.com
  </div>

</div>
</body>
</html>`;

    const { error } = await getResendClient().emails.send({
      from: 'Dark Recon <autopilot@dark-recon.com>',
      to: RECIPIENT_EMAIL,
      subject,
      html,
    });

    if (error) throw new Error(error.message);

    try {
      const supabase = createAdminClient();
      await supabase.from('audit_log').insert({
        event_type: 'system_health_checked',
        action_taken: `EOD EMAIL: Day P&L ${dayPnL >= 0 ? '+' : ''}$${dayPnL.toFixed(2)}, Portfolio $${equity.toLocaleString()}`,
        rationale: `Daily end-of-day summary sent to ${RECIPIENT_EMAIL}`,
        dollar_amount: dayPnL,
        portfolio_value_at_action: equity,
        outcome: 'not_applicable',
        source: 'cron',
        event_at: new Date().toISOString(),
      });
    } catch {
      /* non-fatal */
    }

    return {
      success: true,
      message: `EOD summary sent — Day: ${dayPnL >= 0 ? '+' : ''}$${dayPnL.toFixed(2)}`,
    };
  } catch (error) {
    console.error('Daily P&L email error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'EOD email failed',
    };
  }
}
