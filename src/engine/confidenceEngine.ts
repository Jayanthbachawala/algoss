import { aiDataStore } from "./aiDataStore";
import type { Signal } from "./strategies";

export interface HistoricalConfidence {
  confidence: number;
  winRate: number;
  trades: number;
}

export const getHistoricalConfidence = (signal: Exclude<Signal, "NO_TRADE">): HistoricalConfidence | null => {
  const { tradeOutcomes } = aiDataStore.getDataset();
  const relevant = tradeOutcomes.filter((sample) => sample.signal === signal);

  if (relevant.length === 0) {
    return null;
  }

  const wins = relevant.filter((sample) => sample.outcome === "WIN").length;
  const winRate = wins / relevant.length;

  return {
    confidence: Math.round(winRate * 100),
    winRate,
    trades: relevant.length,
  };
};
