import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface TaskAction {
  action_type: string;
  endpoint: string | null;
  method?: string;
  body?: Record<string, unknown> | null;
  label: string;
  explanation: string;
  requires_confirmation: boolean;
  confirmation_message: string | null;
}

const DIRECT_ACTIONS: { keywords: string[]; action: TaskAction }[] = [
  {
    keywords: ['cancel', 'order', 'limit order', 'pending order', 'alpaca order'],
    action: {
      action_type: 'api',
      endpoint: '/api/trading/orders/cancel-all',
      method: 'DELETE',
      body: null,
      label: 'CANCEL ALL ORDERS',
      explanation: 'Cancels all pending Alpaca orders',
      requires_confirmation: true,
      confirmation_message: 'Cancel ALL pending Alpaca orders?',
    },
  },
  {
    keywords: ['close', 'position', 'close all', 'reset portfolio', 'fresh start'],
    action: {
      action_type: 'api',
      endpoint: '/api/trading/positions/close-all',
      method: 'DELETE',
      body: null,
      label: 'CLOSE ALL POSITIONS',
      explanation: 'Closes all open positions',
      requires_confirmation: true,
      confirmation_message: 'Close ALL open positions and reset to cash?',
    },
  },
  {
    keywords: ['clear queue', 'clear trade queue', 'clear pending queue'],
    action: {
      action_type: 'api',
      endpoint: '/api/queue/clear',
      method: 'DELETE',
      body: null,
      label: 'CLEAR QUEUE',
      explanation: 'Clears all pending trade queue entries',
      requires_confirmation: false,
      confirmation_message: null,
    },
  },
  {
    keywords: ['health check', 'launch checklist', 'system check', 'run launch', 'verify system'],
    action: {
      action_type: 'api',
      endpoint: '/api/system/health',
      method: 'GET',
      body: null,
      label: 'RUN HEALTH CHECK',
      explanation: 'Runs all system health checks',
      requires_confirmation: false,
      confirmation_message: null,
    },
  },
  {
    keywords: ['test email', 'send email', 'weekly email', 'verify email'],
    action: {
      action_type: 'api',
      endpoint: '/api/email/test',
      method: 'POST',
      body: null,
      label: 'SEND TEST EMAIL',
      explanation: 'Sends a test weekly performance email',
      requires_confirmation: false,
      confirmation_message: null,
    },
  },
  {
    keywords: ['build queue', 'build trade queue', 'trade queue', 'populate queue'],
    action: {
      action_type: 'api',
      endpoint: '/api/queue',
      method: 'POST',
      body: { action: 'build' },
      label: 'BUILD QUEUE',
      explanation: 'Builds new pre-sized trades for approval',
      requires_confirmation: false,
      confirmation_message: null,
    },
  },
  {
    keywords: ['run autopilot', 'autopilot report', 'daily analysis', 'autopilot'],
    action: {
      action_type: 'api',
      endpoint: '/api/autopilot?refresh=true',
      method: 'GET',
      body: null,
      label: 'RUN AUTOPILOT',
      explanation: 'Generates fresh Autopilot daily analysis',
      requires_confirmation: false,
      confirmation_message: null,
    },
  },
  {
    keywords: ['intelligence sweep', 'sweep intel', 'run sweep', 'reddit sweep', 'intel sweep'],
    action: {
      action_type: 'api',
      endpoint: '/api/intelligence?refresh=true',
      method: 'GET',
      body: null,
      label: 'RUN INTEL SWEEP',
      explanation: 'Sweeps Reddit, SEC, and news for signals',
      requires_confirmation: false,
      confirmation_message: null,
    },
  },
  {
    keywords: ['smart money', 'congressional', 'congress data', 'pelosi', 'refresh congress'],
    action: {
      action_type: 'api',
      endpoint: '/api/smartmoney',
      method: 'GET',
      body: null,
      label: 'REFRESH SMART MONEY',
      explanation: 'Refreshes congressional trading data',
      requires_confirmation: false,
      confirmation_message: null,
    },
  },
  {
    keywords: ['stop loss audit', 'audit stop', 'check stops', 'stop loss check', 'unprotected position', 'stop loss', 'set stop', 'defensive stop', 'stop at $', 'stop-loss on'],
    action: {
      action_type: 'api',
      endpoint: '/api/portfolio/audit',
      method: 'GET',
      body: null,
      label: 'RUN STOP AUDIT',
      explanation: 'Audits and auto-creates missing stop losses',
      requires_confirmation: false,
      confirmation_message: null,
    },
  },
  {
    keywords: ['dismiss alert', 'triggered alert', 'clear alert', 'price alert', 'nvda alert', 'xle alert', 'dismiss', 'alert', 'clear triggered'],
    action: {
      action_type: 'api',
      endpoint: '/api/alerts/check',
      method: 'GET',
      body: null,
      label: 'CHECK ALERTS',
      explanation: 'Checks and updates all price alert statuses',
      requires_confirmation: false,
      confirmation_message: null,
    },
  },
  {
    keywords: ['duplicate', 'queue entry', 'approve one', 'reject one', 'pair'],
    action: {
      action_type: 'nav',
      endpoint: '/queue',
      method: 'GET',
      body: null,
      label: 'OPEN QUEUE',
      explanation: 'Navigate to Trade Queue to approve/reject duplicate entries',
      requires_confirmation: false,
      confirmation_message: null,
    },
  },
  {
    keywords: ['prepare', 'buy order', 'limit buy', 'targeting', 'allocation'],
    action: {
      action_type: 'api',
      endpoint: '/api/queue',
      method: 'POST',
      body: { action: 'build' },
      label: 'BUILD TRADE QUEUE',
      explanation: 'Builds pre-sized trade queue based on current signals',
      requires_confirmation: false,
      confirmation_message: null,
    },
  },
  {
    keywords: ['reprice', 'reassess', 'evaluate', 'review order'],
    action: {
      action_type: 'nav',
      endpoint: '/portfolio',
      method: 'GET',
      body: null,
      label: 'VIEW PORTFOLIO',
      explanation: 'Navigate to Portfolio to review and reprice orders',
      requires_confirmation: false,
      confirmation_message: null,
    },
  },
  {
    keywords: ['rebalance', 'position size', 'overweight', 'concentration', 'trim position'],
    action: {
      action_type: 'api',
      endpoint: '/api/portfolio/rebalance',
      method: 'GET',
      body: null,
      label: 'RUN REBALANCE CHECK',
      explanation: 'Checks portfolio allocation and queues trims',
      requires_confirmation: false,
      confirmation_message: null,
    },
  },
  {
    keywords: ['correlation', 'sector risk', 'sector exposure', 'overexposed'],
    action: {
      action_type: 'api',
      endpoint: '/api/portfolio/correlation',
      method: 'GET',
      body: null,
      label: 'CHECK CORRELATION',
      explanation: 'Checks for sector concentration risk',
      requires_confirmation: false,
      confirmation_message: null,
    },
  },
  {
    keywords: ['position monitor', 'monitor positions', 'check positions', 'run monitor'],
    action: {
      action_type: 'api',
      endpoint: '/api/monitor',
      method: 'GET',
      body: null,
      label: 'RUN MONITOR',
      explanation: 'Checks all positions for stop breaches',
      requires_confirmation: false,
      confirmation_message: null,
    },
  },
  {
    keywords: ['enable watchlist', 'auto-pop', 'autopop', 'watchlist auto'],
    action: {
      action_type: 'api',
      endpoint: '/api/settings',
      method: 'PATCH',
      body: { key: 'watchlist_autopop_enabled', value: { enabled: true } },
      label: 'ENABLE AUTO-POP',
      explanation: 'Enables watchlist auto-population',
      requires_confirmation: false,
      confirmation_message: null,
    },
  },
  {
    keywords: ['run scanner', 'market scan', 'scan signals', 'signal scan'],
    action: {
      action_type: 'api',
      endpoint: '/api/scan',
      method: 'GET',
      body: null,
      label: 'RUN SCANNER',
      explanation: 'Runs the market signal scanner',
      requires_confirmation: false,
      confirmation_message: null,
    },
  },
];

const NAV_ACTIONS: { keywords: string[]; url: string; label: string }[] = [
  { keywords: ['add tickers', 'recon feed', 'add to watchlist', 'populate watchlist'], url: '/recon', label: 'OPEN WATCHLIST' },
  { keywords: ['log decision', 'strategy decision', 'decision log', 'log first strategy'], url: '/strategy', label: 'OPEN STRATEGY' },
  { keywords: ['set price alert', 'set alert target', 'breakout alert', 'set up price alerts'], url: '/alerts', label: 'SET ALERTS' },
  { keywords: ['review queue', 'approve trade', 'open queue', 'check queue manually', 'duplicate', 'approve one', 'reject one per'], url: '/queue', label: 'OPEN QUEUE' },
  { keywords: ['prepare', 'buy order at', 'limit buy targeting'], url: '/queue', label: 'OPEN TRADE QUEUE' },
  { keywords: ['build thesis', 'thesis builder', 'analyze ticker'], url: '/thesis', label: 'THESIS BUILDER' },
  { keywords: ['view portfolio', 'check portfolio'], url: '/portfolio', label: 'VIEW PORTFOLIO' },
];

function matchDirect(title: string, notes: string): TaskAction | null {
  const text = (title + ' ' + (notes || '')).toLowerCase();
  for (const entry of DIRECT_ACTIONS) {
    if (entry.keywords.some((kw) => text.includes(kw.toLowerCase()))) {
      return entry.action;
    }
  }
  return null;
}

function matchNav(title: string, notes: string): TaskAction | null {
  const text = (title + ' ' + (notes || '')).toLowerCase();
  for (const entry of NAV_ACTIONS) {
    if (entry.keywords.some((kw) => text.includes(kw.toLowerCase()))) {
      return {
        action_type: 'nav',
        endpoint: entry.url,
        method: 'GET',
        body: null,
        label: entry.label,
        explanation: `Navigate to ${entry.url} to complete this manually`,
        requires_confirmation: false,
        confirmation_message: null,
      };
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { title, notes } = await request.json();
    if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

    const directAction = matchDirect(title, notes || '');
    if (directAction) {
      return NextResponse.json({ action: directAction, source: 'direct' });
    }

    const navAction = matchNav(title, notes || '');
    if (navAction) {
      return NextResponse.json({ action: navAction, source: 'nav' });
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `You are Dark Recon's AI Task Executor. Analyze this task and return the action to execute it.

TASK: ${title}
NOTES: ${notes || 'none'}

AVAILABLE API ACTIONS (prefer these over navigation):
- Cancel all orders: DELETE /api/trading/orders/cancel-all
- Close all positions: DELETE /api/trading/positions/close-all
- Clear queue: DELETE /api/queue/clear
- Health check: GET /api/system/health
- Test email: POST /api/email/test
- Build queue: POST /api/queue {"action":"build"}
- Run autopilot: GET /api/autopilot?refresh=true
- Intel sweep: GET /api/intelligence?refresh=true
- Smart money: GET /api/smartmoney
- Stop audit: GET /api/portfolio/audit
- Check alerts: GET /api/alerts/check
- Rebalance: GET /api/portfolio/rebalance
- Monitor: GET /api/monitor
- Scanner: GET /api/scan

NAVIGATION ONLY (when task genuinely needs user to type something):
- Add tickers manually: nav /recon
- Set specific price targets: nav /alerts
- Write strategy rationale: nav /strategy

Return ONLY JSON:
{
  "action_type": "api",
  "endpoint": "/api/system/health",
  "method": "GET",
  "body": null,
  "label": "RUN HEALTH CHECK",
  "explanation": "Runs all 10 system health checks",
  "requires_confirmation": false,
  "confirmation_message": null
}`,
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
      return NextResponse.json({
        action: {
          action_type: 'manual',
          endpoint: null,
          label: 'MARK DONE',
          explanation: 'Review and complete this task manually',
          requires_confirmation: false,
          confirmation_message: null,
        },
        source: 'fallback',
      });
    }

    let action: TaskAction;
    try {
      action = JSON.parse(raw.slice(start, end + 1)) as TaskAction;
    } catch {
      const getField = (field: string) => {
        const match = raw.match(new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`));
        return match ? match[1] : null;
      };
      action = {
        action_type: getField('action_type') || 'manual',
        endpoint: getField('endpoint'),
        method: getField('method') || 'GET',
        body: null,
        label: getField('label') || 'EXECUTE',
        explanation: getField('explanation') || 'Execute this task',
        requires_confirmation: false,
        confirmation_message: null,
      };
    }

    return NextResponse.json({ action, source: 'claude' });
  } catch (error) {
    console.error('Task executor error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
