import type { ClosedPaperTrade } from "./paperTradeService";

export interface PaperTradeMetrics {
  totalTrades: number;
  winRate: number;
  profitLoss: number;
  maxDrawdown: number;
  equityCurve: number[];
}

export const computePaperTradeMetrics = (trades: ClosedPaperTrade[]): PaperTradeMetrics => {
  const totalTrades = trades.length;
  const wins = trades.filter((trade) => trade.pnl > 0).length;
  const profitLoss = Number(trades.reduce((sum, trade) => sum + trade.pnl, 0).toFixed(2));

  let runningPnl = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const equityCurve = trades.map((trade) => {
    runningPnl += trade.pnl;
    peak = Math.max(peak, runningPnl);
    maxDrawdown = Math.max(maxDrawdown, peak - runningPnl);
    return Number(runningPnl.toFixed(2));
  });

  return {
    totalTrades,
    winRate: totalTrades === 0 ? 0 : Number(((wins / totalTrades) * 100).toFixed(2)),
    profitLoss,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    equityCurve,
  };
};
