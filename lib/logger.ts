import pino from "pino";

/**
 * Shared application logger.
 * Set LOG_LEVEL env var to override (default: "info").
 * In production, outputs newline-delimited JSON for log aggregation.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  formatters: {
    level: (label) => ({ level: label }),
  },
});
