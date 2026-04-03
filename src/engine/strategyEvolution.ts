import { aiDataStore, type LearningTradeRecord } from "./aiDataStore";

export interface StrategyPerformance {
  strategyId: string;
  winRate: number;
  avgPnl: number;
  maxDrawdown: number;
  totalTrades: number;
  last50WinRate: number;
  status: "DISABLED" | "ACTIVE" | "PROMOTED";
}

const LAST_N_TRADES = 50;

const toTimestamp = (trade: LearningTradeRecord): number => {
  const parsed = Date.parse(trade.timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getStrategyId = (trade: LearningTradeRecord): string =>
  trade.features.strategyId || `${trade.features.regime}_${trade.signal}`;

const calculateMaxDrawdown = (trades: LearningTradeRecord[]): number => {
  let runningPnl = 0;
  let peak = 0;
  let maxDrawdown = 0;

  trades.forEach((trade) => {
    runningPnl += trade.pnl;
    peak = Math.max(peak, runningPnl);
    maxDrawdown = Math.max(maxDrawdown, peak - runningPnl);
  });

  return Number(maxDrawdown.toFixed(2));
};

export const getStrategyPerformances = (): StrategyPerformance[] => {
  const allTrades = aiDataStore.getAllTrades();
  const grouped = new Map<string, LearningTradeRecord[]>();

  allTrades.forEach((trade) => {
    const strategyId = getStrategyId(trade);
    const current = grouped.get(strategyId) || [];
    current.push(trade);
    grouped.set(strategyId, current);
  });

  return Array.from(grouped.entries()).map(([strategyId, trades]) => {
    const sorted = [...trades].sort((a, b) => toTimestamp(a) - toTimestamp(b));
    const recent = sorted.slice(-LAST_N_TRADES);

    const wins = sorted.filter((trade) => trade.outcome === "WIN").length;
    const totalPnl = sorted.reduce((sum, trade) => sum + trade.pnl, 0);
    const recentWins = recent.filter((trade) => trade.outcome === "WIN").length;
    const recentWinRate = recent.length > 0 ? (recentWins / recent.length) * 100 : 0;

    const status: StrategyPerformance["status"] =
      recent.length >= LAST_N_TRADES && recentWinRate < 45
        ? "DISABLED"
        : recentWinRate > 65
          ? "PROMOTED"
          : "ACTIVE";

    return {
      strategyId,
      winRate: sorted.length > 0 ? Number(((wins / sorted.length) * 100).toFixed(2)) : 0,
      avgPnl: sorted.length > 0 ? Number((totalPnl / sorted.length).toFixed(2)) : 0,
      maxDrawdown: calculateMaxDrawdown(sorted),
      totalTrades: sorted.length,
      last50WinRate: Number(recentWinRate.toFixed(2)),
      status,
    };
  });
};

export const getTopPerformingStrategies = (): StrategyPerformance[] =>
  getStrategyPerformances()
    .filter((strategy) => strategy.status !== "DISABLED")
    .sort((a, b) => {
      if (b.last50WinRate !== a.last50WinRate) return b.last50WinRate - a.last50WinRate;
      if (b.avgPnl !== a.avgPnl) return b.avgPnl - a.avgPnl;
      return a.maxDrawdown - b.maxDrawdown;
    })
    .slice(0, 3);

export const isStrategyAllowed = (strategyId: string): boolean => {
  const all = getStrategyPerformances();
  const current = all.find((strategy) => strategy.strategyId === strategyId);

  if (current?.status === "DISABLED") return false;

  const topSet = new Set(getTopPerformingStrategies().map((strategy) => strategy.strategyId));
  if (topSet.size === 0) return true;
  return topSet.has(strategyId);
};
