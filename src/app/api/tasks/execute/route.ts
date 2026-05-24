import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AVAILABLE_ACTIONS = `
DARK RECON AVAILABLE API ACTIONS:

TRADING (Alpaca):
- Cancel all pending orders: DELETE /api/trading/orders/cancel-all
- Close all open positions: DELETE /api/trading/positions/close-all
- Get portfolio positions: GET /api/trading/positions
- Get account info: GET /api/trading/account

TRADE QUEUE:
- Build new trade queue (AI pre-sizes trades): POST /api/queue {"action":"build"}
- Clear pending queue entries: DELETE /api/queue/clear
- Get current queue: GET /api/queue

INTELLIGENCE & ANALYSIS:
- Run intelligence sweep (Reddit, SEC, news): GET /api/intelligence?refresh=true
- Refresh smart money / congressional data: GET /api/smartmoney
- Run market scanner: GET /api/scan
- Run autopilot (full daily analysis): GET /api/autopilot?refresh=true

SYSTEM:
- Run system health check (all integrations): GET /api/system/health
- Send test weekly email: POST /api/email/test
- Check price alerts: GET /api/alerts/check
- Run position monitor (check stops): GET /api/monitor
- Run stop loss audit: GET /api/portfolio/audit
- Check correlation risk: GET /api/portfolio/correlation
- Run rebalance check: GET /api/portfolio/rebalance

SETTINGS:
- Enable watchlist auto-population: PATCH /api/settings {"key":"watchlist_autopop_enabled","value":{"enabled":true}}
- Enable auto-close on stop breach: PATCH /api/settings {"key":"auto_close_enabled","value":{"enabled":true}}

NAVIGATION ONLY (requires user input — cannot be automated):
- Add tickers to watchlist: nav /recon
- Set specific price alerts with targets: nav /alerts
- Log strategy decisions with rationale: nav /strategy
- Review and approve trade queue manually: nav /queue
- Build thesis for specific ticker: nav /thesis
`;

interface TaskActionPlan {
  action_type: 'api' | 'nav' | 'none';
  endpoint: string | null;
  method: string | null;
  body: Record<string, unknown> | null;
  label: string;
  explanation: string;
  requires_confirmation: boolean;
  confirmation_message: string | null;
}

function getBaseUrl(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return request.nextUrl.origin;
}

async function analyzeTask(title: string, notes?: string | null): Promise<TaskActionPlan> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `You are Dark Recon's AI Task Executor. Analyze this task and determine the best API action to complete it.

TASK TITLE: ${title}
TASK NOTES: ${notes || 'none'}

${AVAILABLE_ACTIONS}

Respond with ONLY valid JSON. No markdown. Pick the single most appropriate action:

{
  "action_type": "api",
  "endpoint": "/api/trading/orders/cancel-all",
  "method": "DELETE",
  "body": null,
  "label": "CANCEL ALL ORDERS",
  "explanation": "One sentence explaining what this will do",
  "requires_confirmation": true,
  "confirmation_message": "This will cancel all pending orders. Continue?"
}

OR for navigation tasks:
{
  "action_type": "nav",
  "endpoint": "/recon",
  "method": "GET",
  "body": null,
  "label": "OPEN WATCHLIST",
  "explanation": "Navigate to watchlist to add tickers manually",
  "requires_confirmation": false,
  "confirmation_message": null
}

If the task is already done or unclear, return:
{
  "action_type": "none",
  "endpoint": null,
  "method": null,
  "body": null,
  "label": "MARK DONE",
  "explanation": "This task appears to be manual — mark it complete when done",
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

  if (start === -1 || end === -1) {
    throw new Error('Could not determine action');
  }

  return JSON.parse(raw.slice(start, end + 1)) as TaskActionPlan;
}

async function executeApiAction(
  action: TaskActionPlan,
  baseUrl: string
): Promise<{ success: boolean; message: string; raw_result: Record<string, unknown> }> {
  const options: RequestInit = {
    method: action.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
  };

  if (action.body && ['POST', 'PATCH', 'PUT'].includes(action.method || '')) {
    options.body = JSON.stringify(action.body);
  }

  const fullUrl = action.endpoint!.startsWith('http')
    ? action.endpoint!
    : `${baseUrl}${action.endpoint}`;

  const res = await fetch(fullUrl, options);
  const contentType = res.headers.get('content-type');
  let resultData: Record<string, unknown> = {};

  if (contentType?.includes('application/json')) {
    resultData = (await res.json()) as Record<string, unknown>;
  }

  const success = res.ok && resultData.success !== false && !resultData.error;
  const message =
    (resultData.message as string | undefined) ||
    (resultData.launch_message as string | undefined) ||
    (typeof resultData.queued === 'number' ? `✓ ${resultData.queued} trade(s) queued` : undefined) ||
    (resultData.overall_action ? `✓ Autopilot: ${resultData.overall_action}` : undefined) ||
    (success ? `✓ ${action.explanation}` : (resultData.error as string) || 'Action failed');

  return { success, message, raw_result: resultData };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, notes, confirmed, action: providedAction } = body;

    if (!title) {
      return NextResponse.json({ error: 'Task title required' }, { status: 400 });
    }

    const action: TaskActionPlan =
      confirmed && providedAction ? (providedAction as TaskActionPlan) : await analyzeTask(title, notes);

    if (action.action_type === 'api' && action.endpoint) {
      if (action.requires_confirmation && !confirmed) {
        return NextResponse.json({
          executed: false,
          success: false,
          message: action.explanation,
          action,
        });
      }

      try {
        const { success, message, raw_result } = await executeApiAction(
          action,
          getBaseUrl(request)
        );

        return NextResponse.json({
          executed: true,
          success,
          message,
          action,
          raw_result,
        });
      } catch (execError) {
        return NextResponse.json({
          executed: true,
          success: false,
          message: `Execution failed: ${execError instanceof Error ? execError.message : 'Unknown error'}`,
          action,
        });
      }
    }

    return NextResponse.json({
      executed: false,
      success: action.action_type === 'none',
      message: action.explanation,
      action,
    });
  } catch (error) {
    console.error('AI task executor error:', error);
    return NextResponse.json({ error: 'Executor failed' }, { status: 500 });
  }
}
