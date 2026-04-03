export interface TradingWindowStatus {
  allowed: boolean;
  reason?: string;
}

const OPEN_HOUR = 9;
const OPEN_MINUTE = 15;
const CLOSE_HOUR = 15;
const CLOSE_MINUTE = 30;

const FIRST_SKIP_MINUTES = 10;
const LAST_SKIP_MINUTES = 30;

const getIndiaTimeParts = (date: Date): { hour: number; minute: number } => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");

  return { hour, minute };
};

export const getTradingWindowStatus = (date = new Date()): TradingWindowStatus => {
  const { hour, minute } = getIndiaTimeParts(date);
  const currentMinutes = hour * 60 + minute;

  const sessionOpenMinutes = OPEN_HOUR * 60 + OPEN_MINUTE;
  const sessionCloseMinutes = CLOSE_HOUR * 60 + CLOSE_MINUTE;

  if (currentMinutes < sessionOpenMinutes || currentMinutes > sessionCloseMinutes) {
    return {
      allowed: false,
      reason: "Outside market session.",
    };
  }

  if (currentMinutes < sessionOpenMinutes + FIRST_SKIP_MINUTES) {
    return {
      allowed: false,
      reason: "Skipping first 10 minutes after market open.",
    };
  }

  if (currentMinutes >= sessionCloseMinutes - LAST_SKIP_MINUTES) {
    return {
      allowed: false,
      reason: "Skipping last 30 minutes before market close.",
    };
  }

  return { allowed: true };
};
