import { createRiskPlan, type RiskPlan } from "./riskEngine";
import { DEFAULT_COOLDOWN_MS, tradeCooldown } from "./tradeCooldown";
import type { Signal } from "./strategies";

export interface AutoTradeSignalInput {
  signal: Signal;
  confidence: number;
  price: number;
  symbol: string;
  strike: number;
  optionType: "CE" | "PE";
}

export interface DhanOrderConfig {
  proxyBaseUrl?: string;
  dhanClientId: string;
  dhanAccessToken: string;
  securityId: string;
  capital: number;
  exchangeSegment?: "NSE_FNO";
  productType?: "INTRADAY" | "CNC";
  cooldownMs?: number;
}

export interface ActiveTrade {
  signal: Extract<Signal, "BUY_CE" | "BUY_PE">;
  symbol: string;
  strike: number;
  optionType: "CE" | "PE";
  entryPrice: number;
  stopLossPrice: number;
  targetPrice: number;
  quantity: number;
  riskPlan: RiskPlan;
  orderResponse: unknown;
}

export interface AutoTradeOptions {
  enabled: boolean;
}

class AutoTradeService {
  private readonly defaultProxyBaseUrl = "http://localhost:4002";

  private activeTrade: ActiveTrade | null = null;

  private readonly lastSignalByKey = new Map<string, Signal>();

  private getTradeKey(input: AutoTradeSignalInput): string {
    return `${input.symbol}:${input.strike}:${input.optionType}`;
  }

  getActiveTrade(): ActiveTrade | null {
    return this.activeTrade;
  }

  closeActiveTrade(): void {
    this.activeTrade = null;
  }

  private isBuySignal(signal: Signal): signal is "BUY_CE" | "BUY_PE" {
    return signal === "BUY_CE" || signal === "BUY_PE";
  }

  async maybeExecuteTrade(
    input: AutoTradeSignalInput,
    config: DhanOrderConfig,
    options: AutoTradeOptions,
  ): Promise<boolean> {
    const key = this.getTradeKey(input);
    const previousSignal = this.lastSignalByKey.get(key);
    this.lastSignalByKey.set(key, input.signal);

    if (!options.enabled) return false;
    if (!this.isBuySignal(input.signal)) return false;
    if (this.activeTrade) return false;
    if (previousSignal === input.signal) return false;
    if (tradeCooldown.isCooldownActive(input.symbol, config.cooldownMs ?? DEFAULT_COOLDOWN_MS)) return false;

    const riskPlan = createRiskPlan({
      capital: config.capital,
      entryPrice: input.price,
      signal: input.signal,
    });

    const endpoint = `${config.proxyBaseUrl?.trim() || this.defaultProxyBaseUrl}/api/dhan-order`;

    const orderPayload = {
      dhanClientId: config.dhanClientId,
      transactionType: "BUY",
      exchangeSegment: config.exchangeSegment || "NSE_FNO",
      productType: config.productType || "INTRADAY",
      orderType: "MARKET",
      validity: "DAY",
      securityId: config.securityId,
      quantity: riskPlan.quantity,
      price: 0,
      triggerPrice: 0,
      disclosedQuantity: 0,
      afterMarketOrder: false,
      amoTime: "OPEN",
      tag: `risk:${riskPlan.maxRiskAmount}`,
    };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dhan-client-id": config.dhanClientId,
          "x-dhan-access-token": config.dhanAccessToken,
        },
        body: JSON.stringify(orderPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Order failed (${response.status}): ${errorText}`);
      }

      let orderResult: unknown;
      try {
        orderResult = await response.json();
      } catch {
        throw new Error("Order API returned non-JSON response");
      }
      this.activeTrade = {
        signal: input.signal,
        symbol: input.symbol,
        strike: input.strike,
        optionType: input.optionType,
        entryPrice: input.price,
        stopLossPrice: riskPlan.stopLossPrice,
        targetPrice: riskPlan.targetPrice,
        quantity: riskPlan.quantity,
        riskPlan,
        orderResponse: orderResult,
      };

      tradeCooldown.markTrade(input.symbol);
      return true;
    } catch (error) {
      console.error("Auto trade execution failed", error);
      return false;
    }
  }
}

export const autoTradeService = new AutoTradeService();
