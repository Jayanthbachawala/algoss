import type { SignalInputs } from "./indicators";
import { detectMarketRegime, type RegimeResult } from "./regimeEngine";
import { createRiskPlan, type RiskPlan } from "./riskEngine";
import { evaluateSignalStrategy, type SignalResult } from "./strategies";

export type { SignalInputs, SignalResult, RiskPlan, RegimeResult };

export const generateAdvancedQuantSignal = (inputs: SignalInputs): SignalResult => evaluateSignalStrategy(inputs);

export const generateSignal = generateAdvancedQuantSignal;

export const generateMarketRegime = (inputs: SignalInputs): RegimeResult => detectMarketRegime(inputs);

export const generateTradingSignal = generateSignal;

export const generateSignalWithRisk = (inputs: SignalInputs, capital: number): SignalResult & { riskPlan: RiskPlan | null } => {
  const signal = generateSignal(inputs);

  if (signal.signal === "NO_TRADE") {
    return {
      ...signal,
      riskPlan: null,
    };
  }

  return {
    ...signal,
    riskPlan: createRiskPlan({
      capital,
      entryPrice: inputs.price,
      signal: signal.signal,
    }),
  };
};
