import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AVAILABLE_ACTIONS = `
DARK RECON AVAILABLE API ACTIONS:

TRADING (Alpaca):
- Cancel all pending orders: DELETE /api/trading/orders/cancel-all
- Close all open positions: DELETE /api/trading/positions/close-all
- Get portfolio: GET /api/trading/positions

TRADE QUEUE:
- Build new trade queue: POST /api/queue {"action":"build"}
- Clear pending queue: DELETE /api/queue/clear
- View queue: GET /api/queue

INTELLIGENCE:
- Run intelligence sweep: GET /api/intelligence?refresh=true
- Refresh smart money data: GET /api/smartmoney
- Run market scanner: GET /api/scan
- Run autopilot: GET /api/autopilot?refresh=true

SYSTEM:
- Run system health check: GET /api/system/health
- Send test email: POST /api/email/test
- Check price alerts: GET /api/alerts/check
- Run position monitor: GET /api/monitor
- Run stop loss audit: GET /api/portfolio/audit
- Check correlation risk: GET /api/portfolio/correlation
- Run rebalance check: GET /api/portfolio/rebalance

SETTINGS:
- Enable watchlist auto-pop: PATCH /api/settings {"key":"watchlist_autopop_enabled","value":{"enabled":true}}
- Enable auto-close: PATCH /api/settings {"key":"auto_close_enabled","value":{"enabled":true}}

NAVIGATION (requires manual user input — cannot be automated):
- Add tickers to watchlist: NAV /recon
- Set price alert targets: NAV /alerts
- Log strategy decisions: NAV /strategy
- Review trade queue: NAV /queue
- Build thesis: NAV /thesis
`;

export async function POST(request: NextRequest) {
  try {
    const { title, notes } = await request.json();
    if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `You are Dark Recon's AI Task Executor. Analyze this task and return the action to execute it.

TASK: ${title}
NOTES: ${notes || 'none'}

${AVAILABLE_ACTIONS}

Return ONLY valid JSON, no markdown:
{
  "action_type": "api",
  "endpoint": "/api/trading/orders/cancel-all",
  "method": "DELETE",
  "body": null,
  "label": "CANCEL ALL ORDERS",
  "explanation": "Cancels all pending Alpaca limit orders",
  "requires_confirmation": true,
  "confirmation_message": "Cancel all pending orders?"
}

For navigation tasks use action_type "nav". For unclear tasks use action_type "manual" with explanation of what to do.`,
        },
      ],
    });

    const raw = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1) {
      return NextResponse.json({ error: 'Claude returned invalid response' }, { status: 500 });
    }

    const action = JSON.parse(raw.slice(start, end + 1));
    return NextResponse.json({ action });
  } catch (error) {
    console.error('Task executor error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
