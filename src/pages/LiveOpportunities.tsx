import { useCallback, useEffect, useMemo, useState } from "react";
import { runOptionsScanner, type ScannerResult } from "@/engine/scannerEngine";

const signalClassMap: Record<ScannerResult["signal"], string> = {
  BUY_CE: "bg-emerald-100 text-emerald-800 border-emerald-200",
  BUY_PE: "bg-rose-100 text-rose-800 border-rose-200",
};

export const LiveOpportunitiesPage = () => {
  const [confidenceThreshold, setConfidenceThreshold] = useState(65);
  const [items, setItems] = useState<ScannerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const results = await runOptionsScanner({
        confidenceThreshold,
        maxResults: 5,
      });
      setItems(results);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to scan opportunities";
      setError(message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [confidenceThreshold]);

  useEffect(() => {
    void fetchData();

    const timer = setInterval(() => {
      void fetchData();
    }, 60000);

    return () => clearInterval(timer);
  }, [fetchData]);

  const content = useMemo(() => {
    if (loading && items.length === 0) {
      return <p className="text-sm text-muted-foreground">Scanning live opportunities...</p>;
    }

    if (error) {
      return <p className="text-sm text-rose-600">{error}</p>;
    }

    if (items.length === 0) {
      return <p className="text-sm text-muted-foreground">No opportunities matching the selected confidence threshold.</p>;
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2">Symbol</th>
              <th className="py-2">Signal</th>
              <th className="py-2">Strike</th>
              <th className="py-2">Confidence</th>
              <th className="py-2">Learning Win Rate</th>
              <th className="py-2">Confidence Tag</th>
              <th className="py-2">Regime</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={`${item.symbol}-${item.strike}-${item.signal}`} className="border-b last:border-b-0">
                <td className="py-2 font-medium">{item.symbol}</td>
                <td className="py-2">
                  <span className={`rounded border px-2 py-1 text-xs font-semibold ${signalClassMap[item.signal]}`}>
                    {item.signal === "BUY_CE" ? "BUY CE" : "BUY PE"}
                  </span>
                </td>
                <td className="py-2">{item.strike}</td>
                <td className="py-2">{item.confidence}%</td>
                <td className="py-2">{item.historicalWinRate !== null ? `${item.historicalWinRate}%` : "N/A"}</td>
                <td className="py-2">
                  {item.confidenceTag === "HIGH_CONFIDENCE" ? (
                    <span className="rounded border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">
                      HIGH CONFIDENCE
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">NORMAL</span>
                  )}
                </td>
                <td className="py-2">{item.regime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }, [error, items, loading]);

  return (
    <section className="rounded-lg border p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Live Opportunities</h2>
          <p className="text-xs text-muted-foreground">Auto-refreshes every 60 seconds.</p>
        </div>

        <button
          className="rounded border px-3 py-1 text-xs hover:bg-muted"
          disabled={loading}
          type="button"
          onClick={() => void fetchData()}
        >
          Refresh now
        </button>
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-xs text-muted-foreground" htmlFor="confidence-threshold">
          Confidence threshold: {confidenceThreshold}%
        </label>
        <input
          id="confidence-threshold"
          max={90}
          min={60}
          step={1}
          type="range"
          value={confidenceThreshold}
          onChange={(event) => setConfidenceThreshold(Number(event.target.value))}
        />
      </div>

      {content}
    </section>
  );
};
