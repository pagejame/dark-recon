import { Resend } from 'resend';

const EMAIL = process.env.DARK_RECON_EMAIL || 'pagejame@gmail.com';

const sentEscalations = new Set<string>();

interface PositionAlertRow {
  id: string;
  ticker: string;
  alert_type: string;
  message: string;
  fired_at: string;
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');
  return new Resend(apiKey);
}

export async function sendAlertEscalationEmail(alerts: PositionAlertRow[]): Promise<void> {
  const newAlerts = alerts.filter((a) => !sentEscalations.has(a.id));
  if (newAlerts.length === 0) return;

  newAlerts.forEach((a) => sentEscalations.add(a.id));

  const alertRows = newAlerts
    .map(
      (a) => `
    <tr>
      <td style="padding:10px 14px;font-family:monospace;color:#ffd700;font-weight:700;">${a.ticker}</td>
      <td style="padding:10px 14px;font-family:monospace;color:#ff3d5a;font-size:10px;letter-spacing:1px;">${a.alert_type.toUpperCase()}</td>
      <td style="padding:10px 14px;font-size:13px;color:#e8edf5;">${a.message}</td>
      <td style="padding:10px 14px;font-family:monospace;font-size:10px;color:#7a8fa8;">${new Date(a.fired_at).toLocaleTimeString()}</td>
    </tr>`
    )
    .join('');

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#080a0f;font-family:system-ui,sans-serif;color:#e8edf5;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
  <div style="font-family:monospace;font-size:9px;letter-spacing:4px;color:#ff3d5a;margin-bottom:6px;">🚨 DARK RECON ALERT</div>
  <h1 style="font-size:22px;font-weight:800;color:#e8edf5;margin:0 0 6px;">Unacknowledged Critical Alerts</h1>
  <div style="font-family:monospace;font-size:10px;color:#7a8fa8;margin-bottom:24px;">
    ${newAlerts.length} alert${newAlerts.length > 1 ? 's have' : ' has'} been active for over 2 hours without acknowledgment
  </div>

  <div style="background:#ff3d5a10;border:1px solid #ff3d5a40;border-radius:10px;overflow:hidden;margin-bottom:20px;">
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="background:#ff3d5a15;">
          <th style="padding:10px 14px;font-family:monospace;font-size:8px;letter-spacing:2px;color:#ff3d5a;text-align:left;">TICKER</th>
          <th style="padding:10px 14px;font-family:monospace;font-size:8px;letter-spacing:2px;color:#ff3d5a;text-align:left;">TYPE</th>
          <th style="padding:10px 14px;font-family:monospace;font-size:8px;letter-spacing:2px;color:#ff3d5a;text-align:left;">MESSAGE</th>
          <th style="padding:10px 14px;font-family:monospace;font-size:8px;letter-spacing:2px;color:#ff3d5a;text-align:left;">FIRED AT</th>
        </tr>
      </thead>
      <tbody>${alertRows}</tbody>
    </table>
  </div>

  <div style="text-align:center;margin-bottom:20px;">
    <a href="https://dark-recon.com/dashboard" style="
      display:inline-block;padding:12px 32px;
      background:#ff3d5a;color:#fff;border-radius:8px;
      font-family:monospace;font-size:11px;letter-spacing:2px;
      font-weight:700;text-decoration:none;">
      OPEN DARK RECON →
    </a>
  </div>

  <div style="font-family:monospace;font-size:8px;color:#3d5068;text-align:center;letter-spacing:2px;">
    DARK RECON ALPHA · Escalation triggered after 2 hours without acknowledgment
  </div>
</div>
</body>
</html>`;

  await getResendClient().emails.send({
    from: 'Dark Recon <autopilot@dark-recon.com>',
    to: EMAIL,
    subject: `🚨 DARK RECON: ${newAlerts.length} Critical Alert${newAlerts.length > 1 ? 's' : ''} Unacknowledged — Action Required`,
    html,
  });
}
