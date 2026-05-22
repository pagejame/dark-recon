import { NextRequest, NextResponse } from 'next/server';
import { getAccount } from '@/lib/api/alpaca';

export async function POST(request: NextRequest) {
  try {
    const { ticker, strength } = await request.json();

    if (!ticker) {
      return NextResponse.json({ error: 'ticker required' }, { status: 400 });
    }

    const account = await getAccount();
    const equity = parseFloat(account.equity || '100000');

    const riskPct = strength === 'high' ? 0.05 : strength === 'medium' ? 0.03 : 0.01;
    const maxDollarRisk = equity * riskPct;

    let currentPrice = 100;
    try {
      const quoteRes = await fetch(
        `https://data.alpaca.markets/v2/stocks/${String(ticker).toUpperCase()}/quotes/latest`,
        {
          headers: {
            'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
            'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET || '',
          },
        }
      );
      if (quoteRes.ok) {
        const quoteData = await quoteRes.json();
        currentPrice = quoteData?.quote?.ap || quoteData?.quote?.bp || 100;
      }
    } catch {
      // Use fallback price
    }

    const rawQty = Math.floor(maxDollarRisk / currentPrice);
    const qty = Math.max(1, rawQty);
    const dollarValue = qty * currentPrice;

    return NextResponse.json({
      ticker: String(ticker).toUpperCase(),
      strength: strength || 'medium',
      equity,
      risk_pct: riskPct * 100,
      max_dollar_risk: maxDollarRisk,
      current_price: currentPrice,
      recommended_qty: qty,
      dollar_value: dollarValue,
      note: `${(riskPct * 100).toFixed(0)}% of $${equity.toLocaleString()} portfolio = $${maxDollarRisk.toLocaleString()} max risk`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sizing calculation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
