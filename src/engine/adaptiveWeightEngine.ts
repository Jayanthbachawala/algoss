import { aiDataStore, type LearningTradeRecord } from "./aiDataStore";
import type { Signal } from "./strategies";

export type AdaptiveFactor = "OI_ALIGNMENT" | "PCR_CONDITION" | "VOLUME_SPIKE" | "VWAP_ALIGNMENT";

export interface FactorWeightConfig {
  OI_ALIGNMENT: number;
  PCR_CONDITION: number;
  VOLUME_SPIKE: number;
  VWAP_ALIGNMENT: number;
}

export interface FactorPerformanceStat {
  factor: AdaptiveFactor;
  wins: number;
  trades: number;
  successRate: number;
}

const FACTORS: AdaptiveFactor[] = ["OI_ALIGNMENT", "PCR_CONDITION", "VOLUME_SPIKE", "VWAP_ALIGNMENT"];

const isBuySignal = (signal: Signal): signal is "BUY_CE" | "BUY_PE" => signal === "BUY_CE" || signal === "BUY_PE";

const fallbackOIPerformance = (trade: LearningTradeRecord): boolean => trade.features.oiChange !== 0;

const fallbackPcrPerformance = (trade: LearningTradeRecord): boolean =>
  trade.signal === "BUY_CE" ? trade.features.pcr > 1.2 : trade.features.pcr < 0.8;

const fallbackVwapPerformance = (trade: LearningTradeRecord): boolean =>
  trade.signal === "BUY_CE" ? trade.features.vwapDiff > 0 : trade.features.vwapDiff < 0;

const wasFactorAligned = (trade: LearningTradeRecord, factor: AdaptiveFactor): boolean => {
  const stored = trade.features.factorAlignment;
  if (factor === "OI_ALIGNMENT") return stored?.oiAlignment ?? fallbackOIPerformance(trade);
  if (factor === "PCR_CONDITION") return stored?.pcrCondition ?? fallbackPcrPerformance(trade);
  if (factor === "VOLUME_SPIKE") return stored?.volumeSpike ?? Boolean(trade.features.volumeSpike);
  return stored?.vwapAlignment ?? fallbackVwapPerformance(trade);
};

const calculateFactorStats = (trades: LearningTradeRecord[]): FactorPerformanceStat[] =>
  FACTORS.map((factor) => {
    const alignedTrades = trades.filter((trade) => wasFactorAligned(trade, factor));
    const wins = alignedTrades.filter((trade) => trade.outcome === "WIN").length;
    const total = alignedTrades.length;
    const successRate = total > 0 ? Number((wins / total).toFixed(4)) : 0;
    return {
      factor,
      wins,
      trades: total,
      successRate,
    };
  });

const getAdjustedWeight = (baseWeight: number, successRate: number): number => {
  const adjustment = (successRate - 0.5) * 0.8;
  const raw = Math.round(baseWeight * (1 + adjustment));
  const min = Math.max(1, Math.round(baseWeight * 0.5));
  const max = Math.round(baseWeight * 1.5);
  return Math.max(min, Math.min(max, raw));
};

export const getAdaptiveFactorWeights = (
  baseWeights: FactorWeightConfig,
  minTradesPerFactor = 20,
): FactorWeightConfig => {
  const trades = aiDataStore.getAllTrades().filter((trade) => isBuySignal(trade.signal));
  const stats = calculateFactorStats(trades);

  return stats.reduce<FactorWeightConfig>(
    (weights, stat) => {
      if (stat.trades < minTradesPerFactor) return weights;

      return {
        ...weights,
        [stat.factor]: getAdjustedWeight(baseWeights[stat.factor], stat.successRate),
      };
    },
    { ...baseWeights },
  );
};

export const getAdaptiveFactorStats = (): FactorPerformanceStat[] =>
  calculateFactorStats(aiDataStore.getAllTrades().filter((trade) => isBuySignal(trade.signal)));
