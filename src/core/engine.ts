// ── Core orchestration engine ──
// Ties together project manager, session manager, permission engine, and event bus.

import { initDatabase, closeDatabase, getDb } from "../db/database";
import { projectManager } from "./project-manager";
import { sessionManager } from "./session-manager";
import { permissionEngine } from "./permission-engine";
import { eventBus } from "./event-bus";
import { logger } from "../utils/logger";
import { config } from "../config";
import { spawnSync } from "child_process";

const log = logger.create("engine");

let startTime: number;
let cliAvailable = false;

export const engine = {
  projects: projectManager,
  sessions: sessionManager,
  permissions: permissionEngine,
  events: eventBus,

  initialize() {
    log.info("Initializing Conduit engine");
    startTime = Date.now();
    initDatabase();

    // Clean up any orphaned sessions from previous runs
    sessionManager.cleanupOrphanedSessions();

    // Check if Claude Code CLI is available
    try {
      const result = spawnSync(config.cliPath, ["--version"], { timeout: 5000 });
      if (result.error) {
        cliAvailable = false;
        log.error("Claude Code CLI not found", {
          cliPath: config.cliPath,
          error: result.error.message,
          suggestion: "Install Claude Code or set CONDUIT_CLI_PATH environment variable"
        });
      } else {
        cliAvailable = true;
        const version = result.stdout?.toString().trim() || "unknown";
        log.info("Claude Code CLI detected", { cliPath: config.cliPath, version });
      }
    } catch (err: any) {
      cliAvailable = false;
      log.warn("Could not verify Claude Code CLI", { error: err.message });
    }

    log.info("Engine initialized", {
      port: config.port,
      wsPortRange: `${config.wsPortRangeStart}-${config.wsPortRangeEnd}`,
      maxSessions: config.maxSessionsGlobal,
      cliPath: config.cliPath,
    });
  },

  async shutdown() {
    log.info("Shutting down engine");
    await sessionManager.shutdownAll();
    eventBus.clear();
    closeDatabase();
    log.info("Engine shutdown complete");
  },

  // Detailed health check
  health() {
    // DB connectivity check
    let databaseOk = false;
    try {
      const row = getDb().prepare("SELECT 1 AS ok").get() as { ok: number } | undefined;
      databaseOk = row?.ok === 1;
    } catch {
      databaseOk = false;
    }

    const projects = projectManager.list();
    const activeSessions = sessionManager.listActive();
    const activeCount = activeSessions.length;
    const maxSessions = config.maxSessionsGlobal;
    const capacityPct = maxSessions > 0 ? Math.round((activeCount / maxSessions) * 100) : 0;
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    // Status logic
    let status: "healthy" | "degraded" | "unhealthy";
    if (!databaseOk || !cliAvailable) {
      status = "unhealthy";
    } else if (capacityPct > 80) {
      status = "degraded";
    } else {
      status = "healthy";
    }

    return {
      status,
      version: "0.1.0",
      uptime_seconds: uptimeSeconds,
      cli_available: cliAvailable,
      database_ok: databaseOk,
      active_sessions: activeCount,
      max_sessions: maxSessions,
      session_capacity_pct: capacityPct,
      projects: projects.length,
      event_subscribers: eventBus.subscriberCount(),
    };
  },
};
