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

export interface HistoricalSignalRecord extends RawSignalSnapshot {
  id: string;
}

export interface SignalDataset {
  signals: HistoricalSignalRecord[];
  features: SignalFeatureVector[];
  trades: HistoricalTradeRecord[];
}

class AIDataStore {
  private dataset: SignalDataset = {
    signals: [],
    features: [],
    trades: [],
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

  getDataset(): SignalDataset {
    return {
      signals: [...this.dataset.signals],
      features: [...this.dataset.features],
      trades: [...this.dataset.trades],
    };
  }

  clear(): void {
    this.dataset = { signals: [], features: [], trades: [] };
    this.persist();
  }
}

export const aiDataStore = new AIDataStore();
