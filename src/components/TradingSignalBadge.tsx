import { useEffect, useMemo, useState } from "react";
import { alertService, type TelegramConfig } from "@/engine/alertService";
import { autoTradeService, type DhanOrderConfig } from "@/engine/autoTradeService";
import { aiDataStore } from "@/engine/aiDataStore";
import { paperTradeService } from "@/engine/paperTradeService";
import { useTradingSignal, type LiveSignalData } from "@/hooks/useTradingSignal";

const signalStyleMap: Record<string, { label: string; className: string }> = {
  BUY_CE: {
    label: "BUY CE",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  BUY_PE: {
    label: "BUY PE",
    className: "bg-rose-100 text-rose-800 border-rose-200",
  },
  NO_TRADE: {
    label: "NO TRADE",
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
};

export interface TradingSignalBadgeProps {
  liveData: LiveSignalData;
  symbol: string;
  strike: number;
  optionType: "CE" | "PE";
  telegramConfig?: TelegramConfig;
  autoTradeConfig?: DhanOrderConfig;
  defaultAlertsEnabled?: boolean;
  defaultAutoTradeEnabled?: boolean;
  paperTradeCapital?: number;
  className?: string;
}

export const TradingSignalBadge = ({
  liveData,
  symbol,
  strike,
  optionType,
  telegramConfig,
  autoTradeConfig,
  defaultAlertsEnabled = false,
  defaultAutoTradeEnabled = false,
  paperTradeCapital,
  className = "",
}: TradingSignalBadgeProps) => {
  const signalResult = useTradingSignal(liveData);
  const styleConfig = signalStyleMap[signalResult.signal];
  const [alertsEnabled, setAlertsEnabled] = useState(defaultAlertsEnabled);
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(defaultAutoTradeEnabled);

  const signalPayload = useMemo(
    () => ({
      signal: signalResult.signal,
      confidence: signalResult.confidence,
      price: liveData.price,
      symbol,
      strike,
      optionType,
    }),
    [liveData.price, optionType, signalResult.confidence, signalResult.signal, strike, symbol],
  );


  useEffect(() => {
    aiDataStore.recordSignal({
      timestamp: Date.now(),
      symbol,
      signal: signalPayload.signal,
      confidence: signalPayload.confidence,
      price: liveData.price,
      pcr: liveData.pcr,
      oi: liveData.oi ?? liveData.oiChange,
      volume: liveData.volume ?? 0,
    });
  }, [liveData.oi, liveData.oiChange, liveData.pcr, liveData.price, liveData.volume, signalPayload.confidence, signalPayload.signal, symbol]);

  useEffect(() => {
    if (!telegramConfig) {
      return;
    }

    void alertService.maybeSendSignalAlert(signalPayload, telegramConfig, { enabled: alertsEnabled });
  }, [alertsEnabled, signalPayload, telegramConfig]);

  useEffect(() => {
    if (!autoTradeConfig) {
      return;
    }

    void autoTradeService.maybeExecuteTrade(signalPayload, autoTradeConfig, { enabled: autoTradeEnabled });
  }, [autoTradeConfig, autoTradeEnabled, signalPayload]);

  useEffect(() => {
    if (!paperTradeCapital) {
      return;
    }

    const regimeFromReason = signalResult.reason.find((entry) => entry.startsWith("Regime:"))?.split(":")[1]?.trim().split(" ")[0] || "UNKNOWN";
    const volumeSpike = (liveData.volume ?? 0) > (liveData.volumeMovingAverage ?? Number.MAX_SAFE_INTEGER);

    paperTradeService.openTrade({
      ...signalPayload,
      capital: paperTradeCapital,
      signalConditions: signalResult.reason,
      marketFeatures: {
        oiChange: liveData.oiChange,
        pcr: liveData.pcr,
        volume: liveData.volume ?? 0,
        vwapDiff: liveData.price - (liveData.vwap ?? liveData.price),
        regime: regimeFromReason,
        volumeSpike,
        factorAlignment: signalResult.factorAlignment,
        strategyId: signalResult.strategyId,
      },
    });
  }, [
    liveData.oiChange,
    liveData.pcr,
    liveData.price,
    liveData.volume,
    liveData.volumeMovingAverage,
    liveData.vwap,
    paperTradeCapital,
    signalPayload,
    signalResult.factorAlignment,
    signalResult.reason,
    signalResult.strategyId,
  ]);

  return (
    <div className={`rounded-md border p-3 ${className}`.trim()}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-1 text-xs font-semibold ${styleConfig.className}`}>{styleConfig.label}</span>
          <span className="text-xs text-muted-foreground">Confidence: {signalResult.confidence.toFixed(0)}%</span>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              checked={alertsEnabled}
              type="checkbox"
              onChange={(event) => setAlertsEnabled(event.target.checked)}
            />
            Enable Alerts
          </label>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              checked={autoTradeEnabled}
              type="checkbox"
              onChange={(event) => setAutoTradeEnabled(event.target.checked)}
            />
            AUTO TRADE
          </label>
        </div>
      </div>
      <ul className="text-sm text-muted-foreground">{signalResult.reason.map((item, index) => <li key={`${index}-${item}`}>• {item}</li>)}</ul>
    </div>
  );
};
