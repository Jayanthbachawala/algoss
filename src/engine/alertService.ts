import type { Signal } from "./strategies";

export interface TradingSignalAlertInput {
  signal: Signal;
  confidence: number;
  price: number;
  symbol: string;
  strike: number;
  optionType: "CE" | "PE";
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

const SIGNAL_TRANSITIONS_THAT_ALERT = new Set<string>([
  "NO_TRADE->BUY_CE",
  "NO_TRADE->BUY_PE",
  "BUY_CE->BUY_PE",
  "BUY_PE->BUY_CE",
]);

const formatSignalLabel = (signal: Signal): string => signal.replace("_", " ");

const formatConfidence = (confidence: number): number => {
  if (confidence <= 1) return Math.round(confidence * 100);
  return Math.round(confidence);
};

export interface AlertOptions {
  enabled: boolean;
}

class AlertService {
  private readonly lastSignalByKey = new Map<string, Signal>();

  private getSignalKey(input: TradingSignalAlertInput): string {
    return `${input.symbol}:${input.strike}:${input.optionType}`;
  }

  private shouldTriggerAlert(previousSignal: Signal | undefined, nextSignal: Signal): boolean {
    if (!previousSignal) {
      return nextSignal !== "NO_TRADE";
    }

    if (previousSignal === nextSignal) {
      return false;
    }

    return SIGNAL_TRANSITIONS_THAT_ALERT.has(`${previousSignal}->${nextSignal}`);
  }

  private getTelegramMessage(input: TradingSignalAlertInput): string {
    return [
      `Stock: ${input.symbol}`,
      `Signal: ${formatSignalLabel(input.signal)}`,
      `Strike: ${input.strike} ${input.optionType}`,
      `Price: ₹${input.price}`,
      `Confidence: ${formatConfidence(input.confidence)}%`,
    ].join("\n");
  }

  async maybeSendSignalAlert(input: TradingSignalAlertInput, telegram: TelegramConfig, options: AlertOptions): Promise<boolean> {
    const key = this.getSignalKey(input);
    const previousSignal = this.lastSignalByKey.get(key);

    this.lastSignalByKey.set(key, input.signal);

    if (!options.enabled) {
      return false;
    }

    if (!this.shouldTriggerAlert(previousSignal, input.signal)) {
      return false;
    }

    const endpoint = `https://api.telegram.org/bot${telegram.botToken}/sendMessage`;
    const message = this.getTelegramMessage(input);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: telegram.chatId,
          text: message,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Telegram API error (${response.status}): ${errorBody}`);
      }

      return true;
    } catch (error) {
      console.error("Failed to send Telegram signal alert", error);
      return false;
    }
  }
}

export const alertService = new AlertService();
