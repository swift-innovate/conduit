// ── Structured logging ──

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? "info";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
}

function formatLog(level: LogLevel, component: string, message: string, data?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const base = { timestamp, level, component, message, ...data };
  return JSON.stringify(base);
}

function createLogger(component: string) {
  return {
    debug(message: string, data?: Record<string, unknown>) {
      if (shouldLog("debug")) console.log(formatLog("debug", component, message, data));
    },
    info(message: string, data?: Record<string, unknown>) {
      if (shouldLog("info")) console.log(formatLog("info", component, message, data));
    },
    warn(message: string, data?: Record<string, unknown>) {
      if (shouldLog("warn")) console.warn(formatLog("warn", component, message, data));
    },
    error(message: string, data?: Record<string, unknown>) {
      if (shouldLog("error")) console.error(formatLog("error", component, message, data));
    },
  };
}

export const logger = {
  create: createLogger,
};
