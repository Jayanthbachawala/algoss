export interface SignalInputs {
  price: number;
  previousPrice: number;
  oiChange: number;
  pcr: number;
  volume: number;
  volumeMovingAverage: number;
  vwap: number;
  callResistance: number;
  putSupport: number;
  iv: number;
  ivHighThreshold?: number;
  recentHighs?: number[];
  recentLows?: number[];
  atr?: number;
  atrBaseline?: number;
}

export type OiPriceClassification = "LONG_BUILDUP" | "SHORT_BUILDUP" | "SHORT_COVERING" | "LONG_UNWINDING" | "NEUTRAL";

export type PcrBias = "BULLISH" | "BEARISH" | "NEUTRAL";

export const classifyOiPriceAction = ({ price, previousPrice, oiChange }: SignalInputs): OiPriceClassification => {
  const priceUp = price > previousPrice;
  const priceDown = price < previousPrice;
  const oiUp = oiChange > 0;
  const oiDown = oiChange < 0;

  if (priceUp && oiUp) return "LONG_BUILDUP";
  if (priceDown && oiUp) return "SHORT_BUILDUP";
  if (priceUp && oiDown) return "SHORT_COVERING";
  if (priceDown && oiDown) return "LONG_UNWINDING";
  return "NEUTRAL";
};

export const getPcrBias = ({ pcr }: SignalInputs): PcrBias => {
  if (pcr < 0.8) return "BEARISH";
  if (pcr > 1.2) return "BULLISH";
  return "NEUTRAL";
};

export const hasVolumeSpike = ({ volume, volumeMovingAverage }: SignalInputs): boolean => volume > volumeMovingAverage;

export const passesVwapForCe = ({ price, vwap }: SignalInputs): boolean => price > vwap;

export const passesVwapForPe = ({ price, vwap }: SignalInputs): boolean => price < vwap;

export const isIvFavorable = ({ iv, ivHighThreshold = 25 }: SignalInputs): boolean => iv < ivHighThreshold;

export const isNearOrAboveSupport = ({ price, putSupport }: SignalInputs): boolean => price >= putSupport;

export const isBelowResistance = ({ price, callResistance }: SignalInputs): boolean => price <= callResistance;
