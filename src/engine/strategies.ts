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
import { getTradingWindowStatus } from "./tradingWindow";
import { getBucketPerformance } from "./learningEngine";
import { getAdaptiveFactorWeights, type FactorWeightConfig } from "./adaptiveWeightEngine";
import { isStrategyAllowed } from "./strategyEvolution";

export type Signal = "BUY_CE" | "BUY_PE" | "NO_TRADE";

export interface SignalResult {
  signal: Signal;
  confidence: number;
  reason: string[];
  strategyId?: string;
  factorAlignment?: {
    oiAlignment: boolean;
    pcrCondition: boolean;
    volumeSpike: boolean;
    vwapAlignment: boolean;
  };
  adaptiveWeights?: FactorWeightConfig;
}

const MIN_SIGNAL_CONFIDENCE = 65;
const clampConfidence = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

const BASE_WEIGHTS: FactorWeightConfig = {
  OI_ALIGNMENT: 25,
  PCR_CONDITION: 15,
  VOLUME_SPIKE: 20,
  VWAP_ALIGNMENT: 20,
};

const STATIC_WEIGHTS = {
  SUPPORT_RESISTANCE: 10,
  IV: 10,
} as const;

interface ScoredSignal {
  signal: Exclude<Signal, "NO_TRADE">;
  confidence: number;
  matchedReasons: string[];
  unmetReasons: string[];
  factorAlignment: {
    oiAlignment: boolean;
    pcrCondition: boolean;
    volumeSpike: boolean;
    vwapAlignment: boolean;
  };
}

const scoreCe = (inputs: SignalInputs, adaptiveWeights: FactorWeightConfig): ScoredSignal => {
  const oiPrice = classifyOiPriceAction(inputs);
  const pcrBias = getPcrBias(inputs);

  const oiPriceAligned = oiPrice === "LONG_BUILDUP" || oiPrice === "SHORT_COVERING";
  const pcrAligned = pcrBias === "BULLISH";
  const volumeAligned = hasVolumeSpike(inputs);
  const vwapAligned = passesVwapForCe(inputs);
  const srAligned = isNearOrAboveSupport(inputs) && isBelowResistance(inputs);
  const ivAligned = isIvFavorable(inputs);

  const confidence =
    (oiPriceAligned ? adaptiveWeights.OI_ALIGNMENT : 0) +
    (pcrAligned ? adaptiveWeights.PCR_CONDITION : 0) +
    (volumeAligned ? adaptiveWeights.VOLUME_SPIKE : 0) +
    (vwapAligned ? adaptiveWeights.VWAP_ALIGNMENT : 0) +
    (srAligned ? STATIC_WEIGHTS.SUPPORT_RESISTANCE : 0) +
    (ivAligned ? STATIC_WEIGHTS.IV : 0);

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
    factorAlignment: {
      oiAlignment: oiPriceAligned,
      pcrCondition: pcrAligned,
      volumeSpike: volumeAligned,
      vwapAlignment: vwapAligned,
    },
  };
};

const scorePe = (inputs: SignalInputs, adaptiveWeights: FactorWeightConfig): ScoredSignal => {
  const oiPrice = classifyOiPriceAction(inputs);
  const pcrBias = getPcrBias(inputs);

  const oiPriceAligned = oiPrice === "SHORT_BUILDUP" || oiPrice === "LONG_UNWINDING";
  const pcrAligned = pcrBias === "BEARISH";
  const volumeAligned = hasVolumeSpike(inputs);
  const vwapAligned = passesVwapForPe(inputs);
  const srAligned = inputs.price < inputs.putSupport && isBelowResistance(inputs);
  const ivAligned = isIvFavorable(inputs);

  const confidence =
    (oiPriceAligned ? adaptiveWeights.OI_ALIGNMENT : 0) +
    (pcrAligned ? adaptiveWeights.PCR_CONDITION : 0) +
    (volumeAligned ? adaptiveWeights.VOLUME_SPIKE : 0) +
    (vwapAligned ? adaptiveWeights.VWAP_ALIGNMENT : 0) +
    (srAligned ? STATIC_WEIGHTS.SUPPORT_RESISTANCE : 0) +
    (ivAligned ? STATIC_WEIGHTS.IV : 0);

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
    factorAlignment: {
      oiAlignment: oiPriceAligned,
      pcrCondition: pcrAligned,
      volumeSpike: volumeAligned,
      vwapAlignment: vwapAligned,
    },
  };
};

export const evaluateSignalStrategy = (inputs: SignalInputs): SignalResult => {
  const tradingWindow = getTradingWindowStatus();
  if (!tradingWindow.allowed) {
    return {
      signal: "NO_TRADE",
      confidence: 0,
      reason: [tradingWindow.reason || "Trading window blocked."],
      adaptiveWeights: BASE_WEIGHTS,
    };
  }

  const regime = detectMarketRegime(inputs);

  if (regime.regime === "SIDEWAYS") {
    return {
      signal: "NO_TRADE",
      confidence: clampConfidence(regime.strength),
      reason: ["Market regime is SIDEWAYS; trading disabled."],
      adaptiveWeights: BASE_WEIGHTS,
    };
  }

  const adaptiveWeights = getAdaptiveFactorWeights(BASE_WEIGHTS, 20);
  const ce = scoreCe(inputs, adaptiveWeights);
  const pe = scorePe(inputs, adaptiveWeights);

  const candidate = regime.regime === "TRENDING_UP" ? ce : pe;
  const strategyId = `${regime.regime}_${candidate.signal}`;

  if (!isStrategyAllowed(strategyId)) {
    return {
      signal: "NO_TRADE",
      confidence: 0,
      reason: [`Strategy ${strategyId} disabled by evolution filter (not top-performing or underperforming).`],
      strategyId,
      factorAlignment: candidate.factorAlignment,
      adaptiveWeights,
    };
  }

  const bucketPerformance = getBucketPerformance(
    {
      pcr: inputs.pcr,
      volumeSpike: hasVolumeSpike(inputs),
      regime: regime.regime,
    },
    20,
  );

  const finalConfidence = bucketPerformance ? Math.round(bucketPerformance.winRate * 100) : candidate.confidence;

  if (finalConfidence < MIN_SIGNAL_CONFIDENCE) {
    return {
      signal: "NO_TRADE",
      confidence: finalConfidence,
      reason: [
        `Confidence ${finalConfidence} below threshold ${MIN_SIGNAL_CONFIDENCE}`,
        ...(bucketPerformance
          ? [`Bucket win rate ${(bucketPerformance.winRate * 100).toFixed(2)}% from ${bucketPerformance.trades} trades`]
          : ["Bucket data unavailable or below minimum 20 trades; using rule-based score"]),
        `Adaptive weights OI:${adaptiveWeights.OI_ALIGNMENT} PCR:${adaptiveWeights.PCR_CONDITION} VOL:${adaptiveWeights.VOLUME_SPIKE} VWAP:${adaptiveWeights.VWAP_ALIGNMENT}`,
        ...candidate.unmetReasons,
      ],
      factorAlignment: candidate.factorAlignment,
      adaptiveWeights,
      strategyId,
    };
  }

  return {
    signal: candidate.signal,
    confidence: finalConfidence,
    reason: [
      `Regime: ${regime.regime} (${regime.strength})`,
      ...(bucketPerformance
        ? [`Confidence from learning bucket ${(bucketPerformance.winRate * 100).toFixed(2)}% (${bucketPerformance.trades} trades)`]
        : ["Confidence from rule-based scoring (insufficient bucket data)"]),
      `Adaptive weights OI:${adaptiveWeights.OI_ALIGNMENT} PCR:${adaptiveWeights.PCR_CONDITION} VOL:${adaptiveWeights.VOLUME_SPIKE} VWAP:${adaptiveWeights.VWAP_ALIGNMENT}`,
      ...candidate.matchedReasons,
    ],
    factorAlignment: candidate.factorAlignment,
    adaptiveWeights,
    strategyId,
  };
};
