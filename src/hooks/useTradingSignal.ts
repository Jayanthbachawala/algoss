import { useMemo } from "react";
import { generateSignal } from "@/engine/signalEngine";

export interface LiveSignalData {
  price: number;
  previousPrice: number;
  oiChange: number;
  pcr: number;
  oi?: number;
  volume?: number;
  volumeMovingAverage?: number;
  vwap?: number;
  callResistance?: number;
  putSupport?: number;
  iv?: number;
  ivHighThreshold?: number;
  recentHighs?: number[];
  recentLows?: number[];
  atr?: number;
  atrBaseline?: number;
}

export const useTradingSignal = (data: LiveSignalData) => {
  return useMemo(
    () =>
      generateSignal({
        price: data.price,
        previousPrice: data.previousPrice,
        oiChange: data.oiChange,
        pcr: data.pcr,
        volume: data.volume ?? 0,
        volumeMovingAverage: data.volumeMovingAverage ?? Number.MAX_SAFE_INTEGER,
        vwap: data.vwap ?? data.price,
        callResistance: data.callResistance ?? Number.MAX_SAFE_INTEGER,
        putSupport: data.putSupport ?? Number.MIN_SAFE_INTEGER,
        iv: data.iv ?? Number.MAX_SAFE_INTEGER,
        ivHighThreshold: data.ivHighThreshold,
        recentHighs: data.recentHighs ?? [data.price],
        recentLows: data.recentLows ?? [data.price],
        atr: data.atr ?? 0,
        atrBaseline: data.atrBaseline,
      }),
    [
      data.callResistance,
      data.iv,
      data.ivHighThreshold,
      data.oiChange,
      data.pcr,
      data.previousPrice,
      data.price,
      data.putSupport,
      data.volume,
      data.volumeMovingAverage,
      data.vwap,
      data.recentHighs,
      data.recentLows,
      data.atr,
      data.atrBaseline,
    ],
  );
};
