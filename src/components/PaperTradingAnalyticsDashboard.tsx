import { useMemo } from "react";
import { usePaperTradingAnalytics } from "@/hooks/usePaperTradingAnalytics";

const currency = (value: number) => `₹${value.toFixed(2)}`;

const buildPolylinePoints = (equityCurve: number[], width: number, height: number): string => {
  if (equityCurve.length <= 1) {
    return `0,${height / 2} ${width},${height / 2}`;
  }

  const min = Math.min(...equityCurve);
  const max = Math.max(...equityCurve);
  const range = max - min || 1;

  return equityCurve
    .map((value, index) => {
      const x = (index / (equityCurve.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");
};

export const PaperTradingAnalyticsDashboard = () => {
  const { history, metrics } = usePaperTradingAnalytics();

  const chartPoints = useMemo(() => buildPolylinePoints(metrics.equityCurve, 420, 160), [metrics.equityCurve]);

  return (
    <section className="rounded-lg border p-4">
      <h3 className="mb-4 text-lg font-semibold">Paper Trading Analytics</h3>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded border p-3">
          <p className="text-xs text-muted-foreground">Win Rate</p>
          <p className="text-xl font-semibold">{metrics.winRate.toFixed(2)}%</p>
        </div>

        <div className="rounded border p-3">
          <p className="text-xs text-muted-foreground">Total Trades</p>
          <p className="text-xl font-semibold">{metrics.totalTrades}</p>
        </div>

        <div className="rounded border p-3">
          <p className="text-xs text-muted-foreground">Profit/Loss</p>
          <p className={`text-xl font-semibold ${metrics.profitLoss >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {currency(metrics.profitLoss)}
          </p>
        </div>

        <div className="rounded border p-3">
          <p className="text-xs text-muted-foreground">Max Drawdown</p>
          <p className="text-xl font-semibold text-rose-600">{currency(metrics.maxDrawdown)}</p>
        </div>
      </div>

      <div className="rounded border p-3">
        <p className="mb-2 text-xs text-muted-foreground">Equity Curve</p>
        <svg viewBox="0 0 420 160" className="h-40 w-full">
          <polyline fill="none" stroke="currentColor" strokeWidth="2" points={chartPoints} />
        </svg>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">Closed trades tracked: {history.length}</p>
    </section>
  );
};
