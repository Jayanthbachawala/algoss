import { aiDataStore } from "./aiDataStore";
import { DEFAULT_COOLDOWN_MS, tradeCooldown } from "./tradeCooldown";
import { createRiskPlan, type RiskPlan } from "./riskEngine";
import { updateLearningBuckets } from "./learningEngine";
import type { Signal } from "./strategies";

export interface PaperTradeInput {
  signal: Signal;
  price: number;
  symbol: string;
  strike: number;
  optionType: "CE" | "PE";
  capital: number;
  cooldownMs?: number;
  signalConditions?: string[];
  marketFeatures?: {
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
}

export interface PaperTrade {
  id: string;
  signal: Extract<Signal, "BUY_CE" | "BUY_PE">;
  symbol: string;
  strike: number;
  optionType: "CE" | "PE";
  entryPrice: number;
  quantity: number;
  stopLossPrice: number;
  targetPrice: number;
  riskPlan: RiskPlan;
  signalConditions: string[];
  marketFeatures: {
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
  status: "OPEN" | "CLOSED";
}

export interface ClosedPaperTrade extends PaperTrade {
  status: "CLOSED";
  exitPrice: number;
  pnl: number;
  outcome: "WIN" | "LOSS";
  closedAt: number;
}

type Listener = () => void;

class PaperTradeService {
  private activeTrade: PaperTrade | null = null;

  private readonly lastSignalByKey = new Map<string, Signal>();

  private readonly tradeHistory: ClosedPaperTrade[] = [];

  private readonly listeners = new Set<Listener>();

  getActiveTrade(): PaperTrade | null {
    return this.activeTrade;
  }

  getTradeHistory(): ClosedPaperTrade[] {
    return [...this.tradeHistory];
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  closeActiveTrade(exitPrice: number): ClosedPaperTrade | null {
    if (!this.activeTrade) {
      return null;
    }

    const pnl = Number(((exitPrice - this.activeTrade.entryPrice) * this.activeTrade.quantity).toFixed(2));

    const closedTrade: ClosedPaperTrade = {
      ...this.activeTrade,
      status: "CLOSED",
      exitPrice,
      pnl,
      outcome: pnl >= 0 ? "WIN" : "LOSS",
      closedAt: Date.now(),
    };

    this.tradeHistory.push(closedTrade);

    aiDataStore.recordTrade({
      id: closedTrade.id,
      symbol: closedTrade.symbol,
      signal: closedTrade.signal,
      entryPrice: closedTrade.entryPrice,
      exitPrice: closedTrade.exitPrice,
      quantity: closedTrade.quantity,
      pnl: closedTrade.pnl,
    });

    aiDataStore.recordTradeOutcome({
      features: {
        symbol: closedTrade.symbol,
        strike: closedTrade.strike,
        optionType: closedTrade.optionType,
        entryPrice: closedTrade.entryPrice,
        exitPrice: closedTrade.exitPrice,
        quantity: closedTrade.quantity,
        stopLossPrice: closedTrade.stopLossPrice,
        targetPrice: closedTrade.targetPrice,
        riskPerUnit: closedTrade.riskPlan.riskPerUnit,
        maxRiskAmount: closedTrade.riskPlan.maxRiskAmount,
        signalConditions: closedTrade.signalConditions.join(" | "),
      },
      signal: closedTrade.signal,
      outcome: closedTrade.outcome,
      pnl: closedTrade.pnl,
    });

    aiDataStore.saveTrade({
      timestamp: new Date(closedTrade.closedAt).toISOString(),
      symbol: closedTrade.symbol,
      signal: closedTrade.signal,
      features: {
        ...closedTrade.marketFeatures,
        volumeSpike:
          closedTrade.marketFeatures.volumeSpike ??
          closedTrade.signalConditions.some((condition) => condition.toLowerCase().includes("volume spike")),
        factorAlignment: closedTrade.marketFeatures.factorAlignment,
        strategyId: closedTrade.marketFeatures.strategyId,
      },
      outcome: closedTrade.outcome,
      pnl: closedTrade.pnl,
    });

    updateLearningBuckets();

    this.activeTrade = null;
    this.notify();

    return closedTrade;
  }

  private getTradeKey(input: PaperTradeInput): string {
    return `${input.symbol}:${input.strike}:${input.optionType}`;
  }

  private isBuySignal(signal: Signal): signal is "BUY_CE" | "BUY_PE" {
    return signal === "BUY_CE" || signal === "BUY_PE";
  }

  openTrade(input: PaperTradeInput): PaperTrade | null {
    const key = this.getTradeKey(input);
    const previousSignal = this.lastSignalByKey.get(key);
    this.lastSignalByKey.set(key, input.signal);

    if (!this.isBuySignal(input.signal)) return null;
    if (this.activeTrade) return null;
    if (previousSignal === input.signal) return null;
    if (tradeCooldown.isCooldownActive(input.symbol, input.cooldownMs ?? DEFAULT_COOLDOWN_MS)) return null;

    const riskPlan = createRiskPlan({
      capital: input.capital,
      entryPrice: input.price,
      signal: input.signal,
    });

    this.activeTrade = {
      id: `${Date.now()}-${input.symbol}-${input.strike}`,
      signal: input.signal,
      symbol: input.symbol,
      strike: input.strike,
      optionType: input.optionType,
      entryPrice: input.price,
      quantity: riskPlan.quantity,
      stopLossPrice: riskPlan.stopLossPrice,
      targetPrice: riskPlan.targetPrice,
      riskPlan,
      signalConditions: input.signalConditions || [],
      marketFeatures: input.marketFeatures || {
        oiChange: 0,
        pcr: 1,
        volume: 0,
        vwapDiff: 0,
        regime: "UNKNOWN",
        volumeSpike: false,
        factorAlignment: {
          oiAlignment: false,
          pcrCondition: false,
          volumeSpike: false,
          vwapAlignment: false,
        },
        strategyId: "UNKNOWN",
      },
      status: "OPEN",
    };

    tradeCooldown.markTrade(input.symbol);
    this.notify();
    return this.activeTrade;
  }
}

export const paperTradeService = new PaperTradeService();
