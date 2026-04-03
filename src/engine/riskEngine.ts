import type { Signal } from "./strategies";

export const MAX_RISK_PER_TRADE = 0.02;
export const STOP_LOSS_PCT = 0.2;
export const TARGET_PCT = 0.4;

export interface RiskInput {
  capital: number;
  entryPrice: number;
  signal: Signal;
}

export interface RiskPlan {
  maxRiskAmount: number;
  stopLossPrice: number;
  targetPrice: number;
  riskPerUnit: number;
  quantity: number;
}

const isTradableSignal = (signal: Signal): signal is "BUY_CE" | "BUY_PE" => signal === "BUY_CE" || signal === "BUY_PE";

export const createRiskPlan = ({ capital, entryPrice, signal }: RiskInput): RiskPlan => {
  if (!isTradableSignal(signal)) {
    throw new Error("Risk plan can only be generated for BUY_CE/BUY_PE signals.");
  }

  if (capital <= 0 || entryPrice <= 0) {
    throw new Error("Capital and entry price must be greater than zero.");
  }

  const maxRiskAmount = Number((capital * MAX_RISK_PER_TRADE).toFixed(2));
  const stopLossPrice = Number((entryPrice * (1 - STOP_LOSS_PCT)).toFixed(2));
  const targetPrice = Number((entryPrice * (1 + TARGET_PCT)).toFixed(2));
  const riskPerUnit = Number((entryPrice - stopLossPrice).toFixed(2));
  const quantity = Math.max(1, Math.floor(maxRiskAmount / riskPerUnit));

  return {
    maxRiskAmount,
    stopLossPrice,
    targetPrice,
    riskPerUnit,
    quantity,
  };
};
