import { useEffect, useMemo, useState } from "react";
import { computePaperTradeMetrics } from "@/engine/paperTradeAnalytics";
import { paperTradeService, type ClosedPaperTrade } from "@/engine/paperTradeService";

export const usePaperTradingAnalytics = () => {
  const [history, setHistory] = useState<ClosedPaperTrade[]>(() => paperTradeService.getTradeHistory());

  useEffect(() => {
    const unsubscribe = paperTradeService.subscribe(() => {
      setHistory(paperTradeService.getTradeHistory());
    });

    return unsubscribe;
  }, []);

  const metrics = useMemo(() => computePaperTradeMetrics(history), [history]);

  return { history, metrics };
};
