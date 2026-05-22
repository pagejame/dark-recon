import { NextResponse } from 'next/server';
import { getOrders, getAccount, getPortfolioHistory } from '@/lib/api/alpaca';
import { getJournalEntries, type JournalEntry } from '@/lib/db/journal';

interface AlpacaOrder {
  id: string;
  symbol: string;
  side: string;
  status: string;
  qty?: string;
  filled_qty?: string;
  filled_avg_price?: string;
  filled_at?: string;
  updated_at?: string;
}

export async function GET() {
  try {
    const [ordersResult, accountResult, historyResult, journalResult] =
      await Promise.allSettled([
        getOrders('all', 100),
        getAccount(),
        getPortfolioHistory('1M', '1D'),
        getJournalEntries(100),
      ]);

    const orders =
      ordersResult.status === 'fulfilled' ? (ordersResult.value as AlpacaOrder[]) : [];
    const account = accountResult.status === 'fulfilled' ? accountResult.value : null;
    const history = historyResult.status === 'fulfilled' ? historyResult.value : null;
    const journal =
      journalResult.status === 'fulfilled' ? (journalResult.value as JournalEntry[]) : [];

    const filledOrders = orders.filter((o) => o.status === 'filled');

    const totalTrades = filledOrders.length;
    const buyOrders = filledOrders.filter((o) => o.side === 'buy');
    const sellOrders = filledOrders.filter((o) => o.side === 'sell');

    const equity = parseFloat(account?.equity || '100000');
    const lastEquity = parseFloat(account?.last_equity || '100000');
    const totalPnL = equity - 100000;
    const dayPnL = equity - lastEquity;

    const tradeHistory = filledOrders.map((order) => ({
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      qty: parseFloat(order.qty || order.filled_qty || '0'),
      filled_price: parseFloat(order.filled_avg_price || '0'),
      filled_at: order.filled_at || order.updated_at,
      dollar_value: parseFloat(order.qty || '0') * parseFloat(order.filled_avg_price || '0'),
    }));

    const signalPerformance: Record<string, { count: number; wins: number; losses: number }> =
      {};
    journal.forEach((entry) => {
      const source = entry.signal_source || 'Unknown';
      if (!signalPerformance[source]) {
        signalPerformance[source] = { count: 0, wins: 0, losses: 0 };
      }
      signalPerformance[source].count++;
      if (entry.result === 'win') signalPerformance[source].wins++;
      if (entry.result === 'loss') signalPerformance[source].losses++;
    });

    const symbolCount: Record<string, number> = {};
    filledOrders.forEach((o) => {
      symbolCount[o.symbol] = (symbolCount[o.symbol] || 0) + 1;
    });
    const topSymbols = Object.entries(symbolCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([symbol, count]) => ({ symbol, count }));

    const portfolioHistory = history
      ? {
          timestamps: history.timestamp || [],
          equity: history.equity || [],
          profit_loss: history.profit_loss || [],
        }
      : null;

    const journalWithResults = journal.filter((j) => j.result);
    const winRate =
      journalWithResults.length > 0
        ? Math.round(
            (journalWithResults.filter((j) => j.result === 'win').length /
              journalWithResults.length) *
              100
          )
        : 0;

    return NextResponse.json({
      summary: {
        total_trades: totalTrades,
        buy_count: buyOrders.length,
        sell_count: sellOrders.length,
        total_pnl: totalPnL,
        day_pnl: dayPnL,
        equity,
        win_rate: winRate,
        journal_count: journal.length,
      },
      trade_history: tradeHistory,
      signal_performance: signalPerformance,
      top_symbols: topSymbols,
      portfolio_history: portfolioHistory,
      journal_entries: journal.slice(0, 20),
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: 'Analytics failed' }, { status: 500 });
  }
}
