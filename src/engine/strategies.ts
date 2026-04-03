import {
  classifyOiPriceAction,
  getPcrBias,
  hasVolumeSpike,
  isBelowResistance,
  isIvFavorable,
  isNearOrAboveSupport,
  passesVwapForCe,
  passesVwapForPe,
  type SignalInputs,
} from "./indicators";
import { detectMarketRegime } from "./regimeEngine";

export type Signal = "BUY_CE" | "BUY_PE" | "NO_TRADE";

export interface SignalResult {
  signal: Signal;
  confidence: number;
  reason: string[];
}

const MIN_SIGNAL_CONFIDENCE = 65;
const clampConfidence = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

const WEIGHTS = {
  OI_PRICE: 25,
  PCR: 15,
  VOLUME: 20,
  VWAP: 20,
  SUPPORT_RESISTANCE: 10,
  IV: 10,
} as const;

interface ScoredSignal {
  signal: Exclude<Signal, "NO_TRADE">;
  confidence: number;
  matchedReasons: string[];
  unmetReasons: string[];
}

const scoreCe = (inputs: SignalInputs): ScoredSignal => {
  const oiPrice = classifyOiPriceAction(inputs);
  const pcrBias = getPcrBias(inputs);

  const oiPriceAligned = oiPrice === "LONG_BUILDUP" || oiPrice === "SHORT_COVERING";
  const pcrAligned = pcrBias === "BULLISH";
  const volumeAligned = hasVolumeSpike(inputs);
  const vwapAligned = passesVwapForCe(inputs);
  const srAligned = isNearOrAboveSupport(inputs) && isBelowResistance(inputs);
  const ivAligned = isIvFavorable(inputs);

  const confidence =
    (oiPriceAligned ? WEIGHTS.OI_PRICE : 0) +
    (pcrAligned ? WEIGHTS.PCR : 0) +
    (volumeAligned ? WEIGHTS.VOLUME : 0) +
    (vwapAligned ? WEIGHTS.VWAP : 0) +
    (srAligned ? WEIGHTS.SUPPORT_RESISTANCE : 0) +
    (ivAligned ? WEIGHTS.IV : 0);

  return {
    signal: "BUY_CE",
    confidence: clampConfidence(confidence),
    matchedReasons: [
      oiPriceAligned ? `OI+Price aligned (${oiPrice})` : "",
      pcrAligned ? `PCR confirms bullish (${inputs.pcr})` : "",
      volumeAligned ? "Volume spike confirmed" : "",
      vwapAligned ? "Price above VWAP" : "",
      srAligned ? "Support/Resistance aligned" : "",
      ivAligned ? "IV condition favorable" : "",
    ].filter(Boolean),
    unmetReasons: [
      oiPriceAligned ? "" : `OI+Price not bullish (${oiPrice})`,
      pcrAligned ? "" : `PCR not bullish-supportive (${inputs.pcr})`,
      volumeAligned ? "" : "Volume spike missing",
      vwapAligned ? "" : "VWAP alignment failed for CE",
      srAligned ? "" : "Support/Resistance check failed",
      ivAligned ? "" : "IV condition not favorable",
    ].filter(Boolean),
  };
};

const scorePe = (inputs: SignalInputs): ScoredSignal => {
  const oiPrice = classifyOiPriceAction(inputs);
  const pcrBias = getPcrBias(inputs);

  const oiPriceAligned = oiPrice === "SHORT_BUILDUP" || oiPrice === "LONG_UNWINDING";
  const pcrAligned = pcrBias === "BEARISH";
  const volumeAligned = hasVolumeSpike(inputs);
  const vwapAligned = passesVwapForPe(inputs);
  const srAligned = inputs.price < inputs.putSupport && isBelowResistance(inputs);
  const ivAligned = isIvFavorable(inputs);

  const confidence =
    (oiPriceAligned ? WEIGHTS.OI_PRICE : 0) +
    (pcrAligned ? WEIGHTS.PCR : 0) +
    (volumeAligned ? WEIGHTS.VOLUME : 0) +
    (vwapAligned ? WEIGHTS.VWAP : 0) +
    (srAligned ? WEIGHTS.SUPPORT_RESISTANCE : 0) +
    (ivAligned ? WEIGHTS.IV : 0);

  return {
    signal: "BUY_PE",
    confidence: clampConfidence(confidence),
    matchedReasons: [
      oiPriceAligned ? `OI+Price aligned (${oiPrice})` : "",
      pcrAligned ? `PCR confirms bearish (${inputs.pcr})` : "",
      volumeAligned ? "Volume spike confirmed" : "",
      vwapAligned ? "Price below VWAP" : "",
      srAligned ? "Support/Resistance aligned" : "",
      ivAligned ? "IV condition favorable" : "",
    ].filter(Boolean),
    unmetReasons: [
      oiPriceAligned ? "" : `OI+Price not bearish (${oiPrice})`,
      pcrAligned ? "" : `PCR not bearish-supportive (${inputs.pcr})`,
      volumeAligned ? "" : "Volume spike missing",
      vwapAligned ? "" : "VWAP alignment failed for PE",
      srAligned ? "" : "Support/Resistance check failed",
      ivAligned ? "" : "IV condition not favorable",
    ].filter(Boolean),
  };
};

export const evaluateSignalStrategy = (inputs: SignalInputs): SignalResult => {
  const regime = detectMarketRegime(inputs);

  if (regime.regime === "SIDEWAYS") {
    return {
      signal: "NO_TRADE",
      confidence: clampConfidence(regime.strength),
      reason: ["Market regime is SIDEWAYS; trading disabled."],
    };
  }

  const ce = scoreCe(inputs);
  const pe = scorePe(inputs);

  const candidate = regime.regime === "TRENDING_UP" ? ce : pe;

  if (candidate.confidence < MIN_SIGNAL_CONFIDENCE) {
    return {
      signal: "NO_TRADE",
      confidence: candidate.confidence,
      reason: [
        `Confidence ${candidate.confidence} below threshold ${MIN_SIGNAL_CONFIDENCE}`,
        ...candidate.unmetReasons,
      ],
    };
  }

  return {
    signal: candidate.signal,
    confidence: candidate.confidence,
    reason: [
      `Regime: ${regime.regime} (${regime.strength})`,
      ...candidate.matchedReasons,
    ],
  };
};
