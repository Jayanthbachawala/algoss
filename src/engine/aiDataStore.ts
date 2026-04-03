import { extractSignalFeatures, type RawSignalSnapshot, type SignalFeatureVector } from "./featureExtraction";
import type { Signal } from "./strategies";

const STORAGE_KEY = "ai_signal_pipeline_dataset_v1";

export interface HistoricalTradeRecord {
  id: string;
  timestamp: number;
  symbol: string;
  signal: Signal;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
}

export interface LearningTradeRecord {
  timestamp: string;
  symbol: string;
  signal: Exclude<Signal, "NO_TRADE">;
  features: {
    oiChange: number;
    pcr: number;
    volume: number;
    vwapDiff: number;
    regime: string;
    volumeSpike?: boolean;
    factorAlignment?: {
      oiAlignment: boolean;
      pcrCondition: boolean;
      volumeSpike: boolean;
      vwapAlignment: boolean;
    };
    strategyId?: string;
  };
  outcome: "WIN" | "LOSS";
  pnl: number;
}

export interface TradeLearningSample {
  features: Record<string, number | string>;
  signal: Exclude<Signal, "NO_TRADE">;
  outcome: "WIN" | "LOSS";
  pnl: number;
  timestamp: number;
}

export interface HistoricalSignalRecord extends RawSignalSnapshot {
  id: string;
}

export interface TradeFilter {
  symbol?: string;
  signal?: Exclude<Signal, "NO_TRADE">;
  outcome?: "WIN" | "LOSS";
  minPnl?: number;
  maxPnl?: number;
}

export interface SignalDataset {
  signals: HistoricalSignalRecord[];
  features: SignalFeatureVector[];
  trades: HistoricalTradeRecord[];
  tradeOutcomes: TradeLearningSample[];
  learningTrades: LearningTradeRecord[];
}

class AIDataStore {
  private dataset: SignalDataset = {
    signals: [],
    features: [],
    trades: [],
    tradeOutcomes: [],
    learningTrades: [],
  };

  constructor() {
    this.load();
  }

  private load(): void {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as SignalDataset;
      this.dataset = {
        signals: parsed.signals || [],
        features: parsed.features || [],
        trades: parsed.trades || [],
        tradeOutcomes: parsed.tradeOutcomes || [],
        learningTrades: parsed.learningTrades || [],
      };
    } catch (error) {
      console.warn("Failed to parse AI dataset cache", error);
    }
  }

  private persist(): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.dataset));
  }

  recordSignal(snapshot: RawSignalSnapshot): void {
    const record: HistoricalSignalRecord = {
      id: `${snapshot.symbol}-${snapshot.timestamp}-${this.dataset.signals.length + 1}`,
      ...snapshot,
    };

    this.dataset.signals.push(record);
    this.dataset.features.push(extractSignalFeatures(snapshot));
    this.persist();
  }

  recordTrade(trade: Omit<HistoricalTradeRecord, "timestamp">): void {
    this.dataset.trades.push({
      ...trade,
      timestamp: Date.now(),
    });
    this.persist();
  }

  recordTradeOutcome(sample: Omit<TradeLearningSample, "timestamp">): void {
    this.dataset.tradeOutcomes.push({
      ...sample,
      timestamp: Date.now(),
    });
    this.persist();
  }

  saveTrade(trade: LearningTradeRecord): void {
    this.dataset.learningTrades.push(trade);
    this.persist();
  }

  getAllTrades(): LearningTradeRecord[] {
    return [...this.dataset.learningTrades];
  }

  getTradesByCondition(filter: TradeFilter): LearningTradeRecord[] {
    return this.dataset.learningTrades.filter((trade) => {
      if (filter.symbol && trade.symbol !== filter.symbol) return false;
      if (filter.signal && trade.signal !== filter.signal) return false;
      if (filter.outcome && trade.outcome !== filter.outcome) return false;
      if (typeof filter.minPnl === "number" && trade.pnl < filter.minPnl) return false;
      if (typeof filter.maxPnl === "number" && trade.pnl > filter.maxPnl) return false;
      return true;
    });
  }

  getDataset(): SignalDataset {
    return {
      signals: [...this.dataset.signals],
      features: [...this.dataset.features],
      trades: [...this.dataset.trades],
      tradeOutcomes: [...this.dataset.tradeOutcomes],
      learningTrades: [...this.dataset.learningTrades],
    };
  }

  clear(): void {
    this.dataset = { signals: [], features: [], trades: [], tradeOutcomes: [], learningTrades: [] };
    this.persist();
  }
}

export const aiDataStore = new AIDataStore();
