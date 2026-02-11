// ── Environment and configuration ──

export interface Config {
  port: number;
  host: string;
  dbPath: string;
  cliPath: string;
  sessionToken: string;
  wsPortRangeStart: number;
  wsPortRangeEnd: number;
  webhookSecret: string;
  maxSessionsGlobal: number;
  permissionTimeoutMs: number;
  sessionIdleTimeoutMs: number;
  projectRoot: string;
  scanDepth: number;
}

function env(key: string, fallback: string = ""): string {
  return process.env[key] ?? fallback;
}

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  return val ? parseInt(val, 10) : fallback;
}

export function loadConfig(): Config {
  return {
    port: envInt("CONDUIT_PORT", 3100),
    host: env("CONDUIT_HOST", "0.0.0.0"),
    dbPath: env("CONDUIT_DB_PATH", "./data/conduit.db"),
    cliPath: env("CONDUIT_CLI_PATH", "claude"),
    sessionToken: env("CLAUDE_CODE_SESSION_ACCESS_TOKEN", ""),
    wsPortRangeStart: envInt("CONDUIT_WS_PORT_RANGE_START", 9000),
    wsPortRangeEnd: envInt("CONDUIT_WS_PORT_RANGE_END", 9100),
    webhookSecret: env("CONDUIT_WEBHOOK_SECRET", ""),
    maxSessionsGlobal: envInt("CONDUIT_MAX_SESSIONS_GLOBAL", 20),
    permissionTimeoutMs: envInt("CONDUIT_PERMISSION_TIMEOUT_MS", 300000),
    sessionIdleTimeoutMs: envInt("CONDUIT_SESSION_IDLE_TIMEOUT_MS", 3600000),
    projectRoot: env("CONDUIT_PROJECT_ROOT", process.env.HOME ?? process.env.USERPROFILE ?? ""),
    scanDepth: envInt("CONDUIT_SCAN_DEPTH", 2),
  };
}

export const config = loadConfig();
