import type { SignalInputs } from "./indicators";

export type MarketRegime = "TRENDING_UP" | "TRENDING_DOWN" | "SIDEWAYS";

export interface RegimeResult {
  regime: MarketRegime;
  strength: number;
}

const clamp = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

const isHigherHighs = (highs: number[]): boolean => highs.length >= 3 && highs.every((high, index) => index === 0 || high > highs[index - 1]);

const isLowerLows = (lows: number[]): boolean => lows.length >= 3 && lows.every((low, index) => index === 0 || low < lows[index - 1]);

export const detectMarketRegime = (inputs: SignalInputs): RegimeResult => {
  const highs = inputs.recentHighs ?? [];
  const lows = inputs.recentLows ?? [];
  const atr = inputs.atr ?? 0;
  const atrBaseline = inputs.atrBaseline ?? Math.max(inputs.price * 0.004, 1);

  const aboveVwap = inputs.price > inputs.vwap;
  const belowVwap = inputs.price < inputs.vwap;

  const higherHighs = isHigherHighs(highs);
  const lowerLows = isLowerLows(lows);

  const atrComponent = clamp((atr / atrBaseline) * 25);
  const vwapDistance = clamp((Math.abs(inputs.price - inputs.vwap) / Math.max(inputs.price, 1)) * 2500);

  if (aboveVwap && higherHighs) {
    return {
      regime: "TRENDING_UP",
      strength: clamp(45 + vwapDistance + atrComponent),
    };
  }

  if (belowVwap && lowerLows) {
    return {
      regime: "TRENDING_DOWN",
      strength: clamp(45 + vwapDistance + atrComponent),
    };
  }

  return {
    regime: "SIDEWAYS",
    strength: clamp(35 - Math.min(vwapDistance, 20)),
  };
};
