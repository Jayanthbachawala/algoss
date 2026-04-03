import { aiDataStore, type LearningTradeRecord } from "./aiDataStore";

const BUCKET_STORAGE_KEY = "ai_learning_bucket_stats_v1";

export interface BucketStat {
  condition: string;
  winRate: number;
  trades: number;
}

export interface FeatureBucketInput {
  pcr: number;
  volumeSpike?: boolean;
  regime: string;
}

const getPcrBucket = (pcr: number): "PCR_LOW" | "PCR_MID" | "PCR_HIGH" => {
  if (pcr < 0.8) return "PCR_LOW";
  if (pcr > 1.2) return "PCR_HIGH";
  return "PCR_MID";
};

const getVolumeBucket = (volumeSpike?: boolean): "VOLUME_SPIKE_YES" | "VOLUME_SPIKE_NO" =>
  volumeSpike ? "VOLUME_SPIKE_YES" : "VOLUME_SPIKE_NO";

const getRegimeBucket = (regime: string): string => {
  if (regime === "TRENDING_UP") return "TRENDING_UP";
  if (regime === "TRENDING_DOWN") return "TRENDING_DOWN";
  return "REGIME_OTHER";
};

export const buildConditionKeyFromFeatures = (features: FeatureBucketInput): string => {
  const pcr = getPcrBucket(features.pcr);
  const volume = getVolumeBucket(features.volumeSpike);
  const regime = getRegimeBucket(features.regime);

  return `${pcr} + ${volume} + ${regime}`;
};

const buildConditionKey = (trade: LearningTradeRecord): string =>
  buildConditionKeyFromFeatures({
    pcr: trade.features.pcr,
    volumeSpike: trade.features.volumeSpike,
    regime: trade.features.regime,
  });

const persistBucketStats = (stats: BucketStat[]): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BUCKET_STORAGE_KEY, JSON.stringify(stats));
};

const readStoredBucketStats = (): BucketStat[] => {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(BUCKET_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as BucketStat[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const calculateBucketStats = (trades: LearningTradeRecord[]): BucketStat[] => {
  const buckets = new Map<string, { wins: number; trades: number }>();

  trades.forEach((trade) => {
    const key = buildConditionKey(trade);
    const current = buckets.get(key) || { wins: 0, trades: 0 };

    current.trades += 1;
    if (trade.outcome === "WIN") {
      current.wins += 1;
    }

    buckets.set(key, current);
  });

  return Array.from(buckets.entries()).map(([condition, values]) => ({
    condition,
    winRate: values.trades > 0 ? Number((values.wins / values.trades).toFixed(4)) : 0,
    trades: values.trades,
  }));
};

export const updateLearningBuckets = (): BucketStat[] => {
  const trades = aiDataStore.getAllTrades();
  const stats = calculateBucketStats(trades);
  persistBucketStats(stats);
  return stats;
};

export const getBucketPerformance = (features: FeatureBucketInput, minTrades = 20): BucketStat | null => {
  const key = buildConditionKeyFromFeatures(features);
  const stored = readStoredBucketStats();
  const fromStored = stored.find((stat) => stat.condition === key && stat.trades >= minTrades);

  if (fromStored) {
    return fromStored;
  }

  const liveStats = calculateBucketStats(aiDataStore.getAllTrades());
  const fromLive = liveStats.find((stat) => stat.condition === key && stat.trades >= minTrades);
  if (fromLive) {
    persistBucketStats(liveStats);
    return fromLive;
  }

  return null;
};
