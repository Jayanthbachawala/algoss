import type { Signal } from "./strategies";

export interface RawSignalSnapshot {
  timestamp: number;
  symbol: string;
  signal: Signal;
  confidence: number;
  price: number;
  pcr: number;
  oi: number;
  volume: number;
}

export interface SignalFeatureVector {
  timestamp: number;
  symbol: string;
  signal: Signal;
  confidence: number;
  price: number;
  pcr: number;
  oi: number;
  volume: number;
  oiToVolumeRatio: number;
  normalizedPcrDistance: number;
}

export const extractSignalFeatures = (snapshot: RawSignalSnapshot): SignalFeatureVector => {
  const oiToVolumeRatio = snapshot.volume > 0 ? Number((snapshot.oi / snapshot.volume).toFixed(6)) : 0;
  const normalizedPcrDistance = Number(Math.abs(snapshot.pcr - 1).toFixed(6));

  return {
    ...snapshot,
    oiToVolumeRatio,
    normalizedPcrDistance,
  };
};
