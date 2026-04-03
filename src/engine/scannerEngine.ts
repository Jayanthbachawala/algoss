import { generateSignal } from "./signalEngine";
import { detectMarketRegime } from "./regimeEngine";
import type { Signal, SignalResult } from "./strategies";
import type { SignalInputs } from "./indicators";
import type { MarketRegime } from "./regimeEngine";
import { DEFAULT_COOLDOWN_MS, tradeCooldown } from "./tradeCooldown";
import { getBucketPerformance } from "./learningEngine";

type JsonRecord = Record<string, unknown>;
interface ChainEntry { strike: number; ce: JsonRecord; pe: JsonRecord }

type DirectionalSignal = Exclude<Signal, "NO_TRADE">;
type StrikeBucket = "ATM" | "ITM" | "OTM";

interface RankedScannerResult extends ScannerResult {
  riskReward: number;
  volatility: number;
  rankingScore: number;
}

export interface ScannerResult {
  symbol: string;
  signal: DirectionalSignal;
  strike: number;
  confidence: number;
  regime: Exclude<MarketRegime, "SIDEWAYS">;
  historicalWinRate: number | null;
  confidenceTag: "NORMAL" | "HIGH_CONFIDENCE";
}

export interface ScannerOptions {
  proxyBaseUrl?: string;
  symbols?: string[];
  confidenceThreshold?: number;
  maxResults?: number;
  requestHeaders?: Record<string, string>;
  timeoutMs?: number;
  intervalMs?: number;
  cooldownMs?: number;
}

const DEFAULT_SYMBOLS = ["NIFTY", "BANKNIFTY", "FINNIFTY"];
const scannerState = new Map<string, { previousPrice: number; volumeAverage: number; highs: number[]; lows: number[] }>();
let foSymbolCache: { symbols: string[]; fetchedAt: number } | null = null;

const toRecord = (value: unknown): JsonRecord => (value && typeof value === "object" ? (value as JsonRecord) : {});
const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const withTimeout = async <T>(fn: Promise<T>, ms: number): Promise<T> => {
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Scanner request timed out after ${ms}ms`)), ms));
  return Promise.race([fn, timeout]);
};

const getChainObject = (optionChainData: JsonRecord): JsonRecord => {
  const data = toRecord(optionChainData.data);
  return toRecord(data.oc || optionChainData.oc || data.optionChain);
};

const getEntries = (optionChainData: JsonRecord): ChainEntry[] => {
  const raw = getChainObject(optionChainData);
  return Object.entries(raw)
    .map(([strike, value]) => {
      const row = toRecord(value);
      return { strike: toNumber(strike), ce: toRecord(row.ce || row.CE), pe: toRecord(row.pe || row.PE) };
    })
    .filter((entry) => entry.strike > 0)
    .sort((a, b) => a.strike - b.strike);
};

const resolveUnderlyingPrice = (optionChainData: JsonRecord): number => {
  const data = toRecord(optionChainData.data);
  return toNumber(data.last_price || data.underlyingValue || optionChainData.underlyingValue || optionChainData.underlying_price, 0);
};

const pickAtmStrike = (entries: Array<{ strike: number }>, underlyingPrice: number): number => {
  if (entries.length === 0) return 0;
  return entries.reduce((best, current) => (Math.abs(current.strike - underlyingPrice) < Math.abs(best.strike - underlyingPrice) ? current : best)).strike;
};

const buildSignalInputs = (symbol: string, optionChainData: JsonRecord): SignalInputs & { strike: number } => {
  const entries = getEntries(optionChainData);
  const data = toRecord(optionChainData.data);
  const underlyingPrice = resolveUnderlyingPrice(optionChainData);
  const atmStrike = pickAtmStrike(entries, underlyingPrice);
  const atm = entries.find((entry) => entry.strike === atmStrike);

  const callResistance = entries.reduce((best, current) => (toNumber(current.ce.oi) > toNumber(best.ce.oi) ? current : best), entries[0] || { strike: atmStrike, ce: {}, pe: {} }).strike;
  const putSupport = entries.reduce((best, current) => (toNumber(current.pe.oi) > toNumber(best.pe.oi) ? current : best), entries[0] || { strike: atmStrike, ce: {}, pe: {} }).strike;

  const totalCallOi = entries.reduce((sum, current) => sum + toNumber(current.ce.oi), 0);
  const totalPutOi = entries.reduce((sum, current) => sum + toNumber(current.pe.oi), 0);
  const totalVolume = entries.reduce((sum, current) => sum + toNumber(current.ce.volume) + toNumber(current.pe.volume), 0);

  const previous = scannerState.get(symbol);
  const previousPrice = previous?.previousPrice ?? underlyingPrice;
  const volumeMovingAverage = previous?.volumeAverage ?? totalVolume;

  const newHighs = [...(previous?.highs ?? []), toNumber(data.high, underlyingPrice)].slice(-6);
  const newLows = [...(previous?.lows ?? []), toNumber(data.low, underlyingPrice)].slice(-6);

  scannerState.set(symbol, {
    previousPrice: underlyingPrice,
    volumeAverage: volumeMovingAverage * 0.8 + totalVolume * 0.2,
    highs: newHighs,
    lows: newLows,
  });

  const atmCe = atm?.ce || {};
  const atmPe = atm?.pe || {};
  const oiChange = toNumber(atmCe.oiChange, toNumber(atmCe.changeInOi)) - toNumber(atmPe.oiChange, toNumber(atmPe.changeInOi));
  const iv = (toNumber(atmCe.iv, toNumber(atmCe.impliedVolatility)) + toNumber(atmPe.iv, toNumber(atmPe.impliedVolatility))) / 2;
  const atr = Math.abs(toNumber(data.high, underlyingPrice) - toNumber(data.low, underlyingPrice));

  return {
    strike: atmStrike,
    price: underlyingPrice,
    previousPrice,
    oiChange,
    pcr: totalCallOi > 0 ? totalPutOi / totalCallOi : 1,
    volume: totalVolume,
    volumeMovingAverage,
    vwap: toNumber(data.vwap, underlyingPrice),
    callResistance,
    putSupport,
    iv,
    recentHighs: newHighs,
    recentLows: newLows,
    atr,
    atrBaseline: Math.max(underlyingPrice * 0.004, 1),
  };
};

const optionSide = (signal: DirectionalSignal): "ce" | "pe" => (signal === "BUY_CE" ? "ce" : "pe");

const classifyStrikeBucket = (signal: DirectionalSignal, strike: number, spot: number, atmStrike: number): StrikeBucket => {
  if (strike === atmStrike) return "ATM";
  if (signal === "BUY_CE") return strike < spot ? "ITM" : "OTM";
  return strike > spot ? "ITM" : "OTM";
};

const getBidAskSpread = (leg: JsonRecord): number => {
  const bid = toNumber(leg.bidPrice, toNumber(leg.bid));
  const ask = toNumber(leg.askPrice, toNumber(leg.ask));
  if (bid > 0 && ask > 0 && ask >= bid) return ask - bid;
  return Number.MAX_SAFE_INTEGER / 1e6;
};

const pickNearestByBucket = (entries: ChainEntry[], target: number, bucket: StrikeBucket, signal: DirectionalSignal, spot: number): ChainEntry | null => {
  const filtered = entries.filter((entry) => classifyStrikeBucket(signal, entry.strike, spot, target) === bucket);
  if (filtered.length === 0) return null;
  return filtered.reduce((best, current) => (Math.abs(current.strike - target) < Math.abs(best.strike - target) ? current : best));
};

const selectBestStrike = (entries: ChainEntry[], signal: DirectionalSignal, spot: number): number => {
  if (entries.length === 0) return 0;
  const atmStrike = pickAtmStrike(entries, spot);

  const candidates = [
    pickNearestByBucket(entries, atmStrike, "ATM", signal, spot),
    pickNearestByBucket(entries, atmStrike, "ITM", signal, spot),
    pickNearestByBucket(entries, atmStrike, "OTM", signal, spot),
  ].filter((entry): entry is ChainEntry => Boolean(entry));

  const legKey = optionSide(signal);
  const maxVolume = Math.max(...candidates.map((entry) => toNumber(entry[legKey].volume, 1)));
  const maxOi = Math.max(...candidates.map((entry) => toNumber(entry[legKey].oi, 1)));
  const maxSpread = Math.max(...candidates.map((entry) => getBidAskSpread(entry[legKey])));

  const scored = candidates.map((entry) => {
    const leg = entry[legKey];
    const volumeScore = (toNumber(leg.volume) / Math.max(maxVolume, 1)) * 50;
    const oiScore = (toNumber(leg.oi) / Math.max(maxOi, 1)) * 35;
    const spreadScore = (1 - getBidAskSpread(leg) / Math.max(maxSpread, 1)) * 15;
    return { strike: entry.strike, score: volumeScore + oiScore + spreadScore };
  });

  return scored.sort((a, b) => b.score - a.score)[0]?.strike ?? atmStrike;
};

const fetchOptionChain = async (symbol: string, options: ScannerOptions): Promise<JsonRecord> => {
  const proxyBaseUrl = options.proxyBaseUrl || "";
  const endpoint = `${proxyBaseUrl}/api/dhan-proxy?endpoint=option-chain&symbol=${encodeURIComponent(symbol)}`;
  const response = await withTimeout(fetch(endpoint, { headers: options.requestHeaders }), options.timeoutMs ?? 12000);
  if (!response.ok) throw new Error(`Failed to fetch option chain for ${symbol}: ${response.status}`);
  return (await response.json()) as JsonRecord;
};

const scanOneSymbol = async (symbol: string, options: ScannerOptions): Promise<RankedScannerResult | null> => {
  const optionChain = await fetchOptionChain(symbol, options);
  const inputs = buildSignalInputs(symbol, optionChain);
  const regime = detectMarketRegime(inputs);
  const bucketPerformance = getBucketPerformance(
    {
      pcr: inputs.pcr,
      volumeSpike: inputs.volume > inputs.volumeMovingAverage,
      regime: regime.regime,
    },
    20,
  );
  const historicalWinRate = bucketPerformance ? bucketPerformance.winRate * 100 : null;

  if (historicalWinRate !== null && historicalWinRate < 50) return null;
  if (historicalWinRate !== null && historicalWinRate <= 60) return null;

  const signal: SignalResult = generateSignal(inputs);

  if (signal.signal === "NO_TRADE") return null;
  if (signal.confidence < (options.confidenceThreshold ?? 65)) return null;
  if (regime.regime === "SIDEWAYS") return null;

  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  if (tradeCooldown.isCooldownActive(symbol, cooldownMs)) return null;

  const bestStrike = selectBestStrike(getEntries(optionChain), signal.signal, inputs.price);
  const { riskReward, volatility } = buildRankingMetrics(signal.signal, inputs);
  const rankingScore = calculateRankingScore({ confidence: signal.confidence, riskReward, volatility });

  tradeCooldown.markTrade(symbol);

  return {
    symbol,
    signal: signal.signal,
    strike: bestStrike,
    confidence: signal.confidence,
    regime: regime.regime,
    historicalWinRate: historicalWinRate !== null ? Number(historicalWinRate.toFixed(2)) : null,
    confidenceTag: historicalWinRate !== null && historicalWinRate > 70 ? "HIGH_CONFIDENCE" : "NORMAL",
    riskReward,
    volatility,
    rankingScore,
  };
};



const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const buildRankingMetrics = (signal: DirectionalSignal, inputs: SignalInputs): { riskReward: number; volatility: number } => {
  const upside = Math.max(inputs.callResistance - inputs.price, 1);
  const downside = Math.max(inputs.price - inputs.putSupport, 1);

  const riskReward = signal === "BUY_CE" ? upside / downside : downside / upside;
  const volatility = inputs.iv + (inputs.atr / Math.max(inputs.price, 1)) * 100;

  return {
    riskReward: Number(riskReward.toFixed(3)),
    volatility: Number(volatility.toFixed(3)),
  };
};

const calculateRankingScore = (candidate: { confidence: number; riskReward: number; volatility: number }): number => {
  const confidenceScore = clamp01(candidate.confidence / 100);
  const riskRewardScore = clamp01(candidate.riskReward / 3);
  const volatilityScore = 1 - clamp01(candidate.volatility / 100);

  return Number((confidenceScore * 0.5 + riskRewardScore * 0.35 + volatilityScore * 0.15).toFixed(6));
};

const fetchFoSymbols = async (options: ScannerOptions): Promise<string[]> => {
  const now = Date.now();
  if (foSymbolCache && now - foSymbolCache.fetchedAt < 10 * 60 * 1000) {
    return foSymbolCache.symbols;
  }

  const proxyBaseUrl = options.proxyBaseUrl || "";
  const endpoint = `${proxyBaseUrl}/api/dhan-proxy?endpoint=instruments`;
  const response = await withTimeout(fetch(endpoint, { headers: options.requestHeaders }), options.timeoutMs ?? 15000);

  if (!response.ok) {
    throw new Error(`Failed to fetch F&O symbol universe: ${response.status}`);
  }

  const payload = (await response.json()) as JsonRecord;
  const data = toRecord(payload.data);
  const instruments = Array.isArray(data.instruments) ? data.instruments : [];

  const symbols = Array.from(
    new Set(
      instruments
        .map((item) => toRecord(item))
        .filter((item) => item.exchangeSegment === "NSE_FNO" && (item.optionType === "CE" || item.optionType === "PE"))
        .map((item) => String(item.symbol || "").trim())
        .filter((symbol) => symbol.length > 0),
    ),
  );

  const merged = Array.from(new Set([...DEFAULT_SYMBOLS, ...symbols]));
  foSymbolCache = { symbols: merged, fetchedAt: now };
  return merged;
};

export const runOptionsScanner = async (options: ScannerOptions = {}): Promise<ScannerResult[]> => {
  const symbols = options.symbols?.length ? options.symbols : await fetchFoSymbols(options);
  const results = await Promise.allSettled(symbols.map((symbol) => scanOneSymbol(symbol, options)));

  return results
    .flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : []))
    .sort((a, b) => b.rankingScore - a.rankingScore)
    .slice(0, 3)
    .map(({ riskReward, volatility, rankingScore, ...rest }) => rest);
};

export const startOptionsScanner = (
  callback: (signals: ScannerResult[]) => void,
  options: ScannerOptions = {},
): { stop: () => void; runNow: () => Promise<void> } => {
  const intervalMs = Math.min(Math.max(options.intervalMs ?? 60000, 60000), 120000);
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;

  const runNow = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      callback(await runOptionsScanner(options));
    } catch (error) {
      console.error("Options scanner run failed", error);
      callback([]);
    } finally {
      inFlight = false;
    }
  };

  timer = setInterval(() => void runNow(), intervalMs);
  void runNow();

  return {
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    },
    runNow,
  };
};
