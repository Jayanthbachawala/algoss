const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000;

class TradeCooldown {
  private readonly lastTradeTimeBySymbol = new Map<string, number>();

  getLastTradeTime(symbol: string): number | null {
    return this.lastTradeTimeBySymbol.get(symbol) ?? null;
  }

  isCooldownActive(symbol: string, cooldownMs = DEFAULT_COOLDOWN_MS, now = Date.now()): boolean {
    const lastTradeTime = this.getLastTradeTime(symbol);
    if (!lastTradeTime) return false;

    return now - lastTradeTime < cooldownMs;
  }

  markTrade(symbol: string, timestamp = Date.now()): void {
    this.lastTradeTimeBySymbol.set(symbol, timestamp);
  }

  getRemainingCooldownMs(symbol: string, cooldownMs = DEFAULT_COOLDOWN_MS, now = Date.now()): number {
    const lastTradeTime = this.getLastTradeTime(symbol);
    if (!lastTradeTime) return 0;

    return Math.max(0, cooldownMs - (now - lastTradeTime));
  }
}

export const tradeCooldown = new TradeCooldown();
export { DEFAULT_COOLDOWN_MS };
