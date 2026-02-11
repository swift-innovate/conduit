// ── Session lifecycle, CLI spawning ──

import { queryAll, queryOne, execute } from "../db/database";
import { generateId } from "../utils/uuid";
import { logger } from "../utils/logger";
import { config } from "../config";
import { NotFoundError, ValidationError, ConflictError } from "../utils/errors";
import { createBridgeServer, type BridgeServer } from "../bridge/ws-server";
import { launchCli, type LaunchedCli } from "../bridge/cli-launcher";
import { permissionEngine } from "./permission-engine";
import { eventBus } from "./event-bus";
import type { Session, CreateSessionInput, SessionStatus, Message } from "./types";
import type { ServerToCliMessage, CliResultMessage, ServerControlResponse } from "../bridge/protocol";

const log = logger.create("session-manager");

// ── Friendly session naming ──
const SESSION_ADJECTIVES = [
  "Swift", "Bright", "Calm", "Sharp", "Bold",
  "Quick", "Keen", "Warm", "Clear", "Deep",
  "Fast", "Steady", "Fresh", "Vivid", "Agile",
  "Quiet", "Crisp", "Smooth", "Prime", "Core",
];

const SESSION_NOUNS = [
  "Spark", "Pulse", "Wave", "Thread", "Stream",
  "Nexus", "Forge", "Relay", "Signal", "Bridge",
  "Orbit", "Prism", "Scope", "Helix", "Arc",
  "Drift", "Flare", "Lattice", "Cipher", "Vector",
];

function generateSessionName(projectId: string): string {
  // Count existing sessions for this project to get a sequential number
  const row = queryOne<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM sessions WHERE project_id = $pid",
    { $pid: projectId },
  );
  const index = (row?.cnt ?? 0);
  const adj = SESSION_ADJECTIVES[index % SESSION_ADJECTIVES.length];
  const noun = SESSION_NOUNS[Math.floor(index / SESSION_ADJECTIVES.length) % SESSION_NOUNS.length];
  return `${adj} ${noun}`;
}

// In-memory tracking of active sessions
interface ActiveSession {
  bridge: BridgeServer;
  cli: LaunchedCli;
  projectId: string;
  cliSessionId?: string; // Claude Code's internal session ID
}

const activeSessions = new Map<string, ActiveSession>();
const usedPorts = new Set<number>();

function allocatePort(): number {
  for (let port = config.wsPortRangeStart; port <= config.wsPortRangeEnd; port++) {
    if (!usedPorts.has(port)) {
      usedPorts.add(port);
      return port;
    }
  }
  throw new ConflictError("No available ports for new session");
}

function releasePort(port: number) {
  usedPorts.delete(port);
}

export const sessionManager = {
  async create(projectId: string, project: { folder_path: string; default_model: string; default_permission_mode: string; system_prompt: string; append_system_prompt: string }, input: CreateSessionInput = {}): Promise<Session> {
    // Check global session limit
    const activeCount = activeSessions.size;
    if (activeCount >= config.maxSessionsGlobal) {
      throw new ConflictError(`Maximum global sessions (${config.maxSessionsGlobal}) reached`);
    }

    const id = generateId();
    const port = allocatePort();
    const model = input.model ?? project.default_model ?? "";
    const VALID_PERMISSION_MODES = ["acceptEdits", "bypassPermissions", "default", "delegate", "dontAsk", "plan"];
    const rawMode = input.permission_mode ?? project.default_permission_mode ?? "default";
    if (rawMode && !VALID_PERMISSION_MODES.includes(rawMode)) {
      throw new ValidationError(`Invalid permission mode '${rawMode}'. Must be one of: ${VALID_PERMISSION_MODES.join(", ")}`);
    }
    const permissionMode = rawMode;
    const now = new Date().toISOString();

    // Insert session record
    execute(
      `INSERT INTO sessions (id, project_id, session_id, name, status, model, ws_port, created_at, last_active_at)
       VALUES ($id, $project_id, $session_id, $name, $status, $model, $ws_port, $created_at, $last_active_at)`,
      {
        $id: id,
        $project_id: projectId,
        $session_id: "", // Will be set when CLI sends system/init on first turn
        $name: input.name ?? generateSessionName(projectId),
        $status: "starting",
        $model: model,
        $ws_port: port,
        $created_at: now,
        $last_active_at: now,
      },
    );

    // Create bridge WS server
    const bridge = await createBridgeServer(port, id, {
      onSystemInit: (sessionId, data: any) => {
        // The CLI sends type="system" subtype="init" BEFORE each turn (not once at connect).
        // Extract the CLI's session ID and update our record.
        const cliSessionId = data.session_id ?? "";
        const active = activeSessions.get(id);
        if (active && !active.cliSessionId) {
          // First init — record the CLI session ID
          execute("UPDATE sessions SET session_id = $sid WHERE id = $id", {
            $sid: cliSessionId,
            $id: id,
          });
          active.cliSessionId = cliSessionId;
          log.info("CLI session ID captured", { id, cli_session_id: cliSessionId, model: data.model });
        }

        // Mark session as active (processing a turn)
        this.updateStatus(id, "active");
        log.info("Session processing turn", { id, cli_session_id: cliSessionId });
      },

      onAssistant: (sessionId, data: any) => {
        this.storeMessage(id, "inbound", "assistant", "", JSON.stringify(data));
      },

      onStreamEvent: (_sessionId, _data: any) => {
        // Token/cost tracking is handled exclusively in onResult,
        // which provides authoritative cumulative totals.
      },

      onResult: (sessionId, data: any) => {
        const result = data as CliResultMessage;
        // CLI v2.1.39 sends total_cost_usd at top level,
        // and token counts inside usage object (not flat fields).
        const inputTokens = result.usage?.input_tokens ?? 0;
        const outputTokens = result.usage?.output_tokens ?? 0;
        const costUsd = result.total_cost_usd ?? 0;

        // Result message contains authoritative cumulative totals — SET, not ADD
        execute(
          `UPDATE sessions SET
            total_cost_usd = $cost,
            total_input_tokens = $input_tokens,
            total_output_tokens = $output_tokens,
            num_turns = num_turns + 1,
            last_active_at = $now,
            status = 'idle'
           WHERE id = $id`,
          {
            $cost: costUsd,
            $input_tokens: inputTokens,
            $output_tokens: outputTokens,
            $now: new Date().toISOString(),
            $id: id,
          },
        );

        // Store the result message
        this.storeMessage(id, "inbound", "result", "", JSON.stringify(data));

        this.updateStatus(id, "idle");
      },

      onPermissionRequest: async (sessionId, requestId, toolName, toolInput) => {
        log.info("Permission request received", { session_id: id, request_id: requestId, tool: toolName });
        const decision = await permissionEngine.evaluate(id, projectId, requestId, toolName, toolInput);

        log.info("Permission response", { session_id: id, request_id: requestId, tool: toolName, decision: decision.behavior });
        // Send response back to CLI using control_response format.
        // CLI v2.1.39 expects: { type: "control_response", response: { subtype: "can_use_tool_result", request_id, result: { behavior } } }
        const response: ServerControlResponse = {
          type: "control_response",
          response: {
            subtype: "can_use_tool_result",
            request_id: requestId,
            result: {
              behavior: decision.behavior,
              updated_input: decision.updated_input,
            },
          },
        };
        bridge.send(response);
      },
    });

    // Launch CLI process — wrap in try/catch so bridge + port are cleaned up on failure
    let cli: LaunchedCli;
    try {
      cli = launchCli({
        cwd: project.folder_path,
        wsPort: port,
        model: model || undefined,
        permissionMode: permissionMode || undefined,
        resumeSessionId: input.resume_session_id,
        systemPrompt: project.system_prompt || undefined,
        appendSystemPrompt: project.append_system_prompt || undefined,
      });
    } catch (err) {
      // Clean up: close bridge server, release port, mark session as error
      const errorMessage = err instanceof Error ? err.message : String(err);
      bridge.close();
      releasePort(port);
      execute("UPDATE sessions SET status = 'error', error_message = $error_message, closed_at = $now WHERE id = $id", {
        $error_message: errorMessage,
        $now: new Date().toISOString(),
        $id: id,
      });
      log.error("CLI launch failed, cleaned up resources", { id, port, error: err });
      throw err;
    }

    // Update PID
    execute("UPDATE sessions SET cli_pid = $pid WHERE id = $id", { $pid: cli.pid, $id: id });

    // Track active session
    activeSessions.set(id, { bridge, cli, projectId });

    // Monitor process exit
    cli.onExit((exitCode) => {
      log.info("CLI process exited", { id, pid: cli.pid, exitCode });
      this.handleProcessExit(id, port);
    });

    // Wait for CLI to connect to the bridge before returning the session.
    // IMPORTANT: The CLI does NOT send any data on connect — it silently
    // connects and waits for user messages. The WebSocket connection event
    // itself is the signal that the CLI is ready. The system/init message
    // only arrives when the first user message triggers a turn.
    try {
      await new Promise<void>((resolve, reject) => {
        const CONNECTION_TIMEOUT_MS = 15_000;

        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error(`CLI failed to connect to bridge within ${CONNECTION_TIMEOUT_MS / 1000}s`));
        }, CONNECTION_TIMEOUT_MS);

        const onExit = (code: number | null) => {
          cleanup();
          reject(new Error(`CLI process exited with code ${code} before connecting to bridge`));
        };

        const cleanup = () => {
          clearTimeout(timeout);
          cli.process.removeListener("exit", onExit);
        };

        // Resolve when CLI WebSocket connects to the bridge.
        // At this point the CLI is ready to receive user messages.
        bridge.onConnect(() => {
          cleanup();
          resolve();
        });

        // Reject if CLI exits before connecting
        cli.process.on("exit", onExit);
      });
    } catch (err) {
      // Connection failed — clean up the session
      const stderr = cli.getStderr();
      const errorMessage = stderr || (err instanceof Error ? err.message : String(err));
      log.error("CLI failed to connect, cleaning up session", { id, error: err, stderr: stderr.slice(0, 500) });
      activeSessions.delete(id);
      bridge.close();
      releasePort(port);
      try { cli.kill(); } catch (_) { /* already exited */ }
      execute("UPDATE sessions SET status = 'error', error_message = $error_message, closed_at = $now WHERE id = $id", {
        $error_message: errorMessage,
        $now: new Date().toISOString(),
        $id: id,
      });
      eventBus.emit({
        type: "session.error",
        session_id: id,
        data: { reason: "cli_failed_to_connect", error_message: errorMessage },
        timestamp: Date.now(),
      });
      throw err;
    }

    // CLI connected — mark session as idle (ready to receive messages).
    // The session will transition to "active" when a user message is sent
    // and the CLI responds with system/init + assistant messages.
    this.updateStatus(id, "idle");

    log.info("Session created and CLI connected", { id, project_id: projectId, port, pid: cli.pid });

    return this.getById(id)!;
  },

  // Send a user message to a session
  sendMessage(sessionId: string, content: string): void {
    const active = activeSessions.get(sessionId);
    if (!active) {
      throw new NotFoundError("Active session", sessionId);
    }

    if (!active.bridge.isConnected()) {
      throw new ConflictError("Cannot send message: CLI is not connected to bridge");
    }

    const message: ServerToCliMessage = {
      type: "user",
      message: { role: "user", content },
    };

    active.bridge.send(message);

    // Update session status
    this.updateStatus(sessionId, "active");
    execute("UPDATE sessions SET last_active_at = $now WHERE id = $id", {
      $now: new Date().toISOString(),
      $id: sessionId,
    });

    // Store outbound message
    this.storeMessage(sessionId, "outbound", "user", "", JSON.stringify(message));

    log.info("Message sent to session", { session_id: sessionId });
  },

  // Interrupt the current turn
  interrupt(sessionId: string): void {
    const active = activeSessions.get(sessionId);
    if (!active) {
      throw new NotFoundError("Active session", sessionId);
    }
    active.bridge.send({ type: "interrupt" });
    log.info("Session interrupted", { session_id: sessionId });
  },

  // Kill a session
  async kill(sessionId: string): Promise<void> {
    const active = activeSessions.get(sessionId);
    if (active) {
      active.cli.kill();
      active.bridge.close();
      releasePort(active.bridge.port);
      activeSessions.delete(sessionId);
    }

    execute("UPDATE sessions SET status = 'closed', closed_at = $now WHERE id = $id", {
      $now: new Date().toISOString(),
      $id: sessionId,
    });

    eventBus.emit({
      type: "session.closed",
      session_id: sessionId,
      data: {},
      timestamp: Date.now(),
    });

    log.info("Session killed", { session_id: sessionId });
  },

  // Get session by ID
  getById(id: string): Session | null {
    return queryOne<Session>("SELECT * FROM sessions WHERE id = $id", { $id: id });
  },

  getByIdOrThrow(id: string): Session {
    const session = this.getById(id);
    if (!session) throw new NotFoundError("Session", id);
    return session;
  },

  // List sessions for a project
  listByProject(projectId: string): Session[] {
    log.debug("Listing sessions for project", { projectId });
    try {
      const result = queryAll<Session>(
        "SELECT * FROM sessions WHERE project_id = $pid ORDER BY created_at DESC",
        { $pid: projectId },
      );
      log.debug("Sessions query successful", { count: result.length });
      return result;
    } catch (err) {
      log.error("Failed to list sessions", { projectId, error: err });
      throw err;
    }
  },

  // List all active sessions
  listActive(): Session[] {
    return queryAll<Session>(
      "SELECT * FROM sessions WHERE status NOT IN ('closed', 'error') ORDER BY last_active_at DESC",
    );
  },

  // Get messages for a session
  getMessages(sessionId: string, limit = 100, offset = 0): Message[] {
    return queryAll<Message>(
      "SELECT * FROM messages WHERE session_id = $sid ORDER BY timestamp ASC LIMIT $limit OFFSET $offset",
      { $sid: sessionId, $limit: limit, $offset: offset },
    );
  },

  // Check if a session is active in memory
  isActive(sessionId: string): boolean {
    return activeSessions.has(sessionId);
  },

  // Get active session count
  activeCount(): number {
    return activeSessions.size;
  },

  // ── Internal helpers ──

  updateStatus(sessionId: string, status: SessionStatus) {
    execute("UPDATE sessions SET status = $status WHERE id = $id", { $status: status, $id: sessionId });
    eventBus.emit({
      type: "session.status",
      session_id: sessionId,
      data: { status },
      timestamp: Date.now(),
    });
  },

  storeMessage(sessionId: string, direction: string, messageType: string, subtype: string, content: string) {
    execute(
      `INSERT INTO messages (id, session_id, direction, message_type, message_subtype, content, timestamp)
       VALUES ($id, $session_id, $direction, $message_type, $message_subtype, $content, $timestamp)`,
      {
        $id: generateId(),
        $session_id: sessionId,
        $direction: direction,
        $message_type: messageType,
        $message_subtype: subtype,
        $content: content,
        $timestamp: new Date().toISOString(),
      },
    );
  },

  handleProcessExit(sessionId: string, port: number) {
    releasePort(port);
    const active = activeSessions.get(sessionId);
    const stderr = active?.cli.getStderr() ?? "";
    if (active) {
      active.bridge.close();
      activeSessions.delete(sessionId);
    }

    const session = this.getById(sessionId);
    if (session && session.status !== "closed") {
      // Determine whether CLI died before ever becoming active
      const neverBecameActive = session.status === "starting" || session.status === "idle";
      const wasActive = session.status === "active";

      // If CLI exited before processing any turn or during an active turn, it's an error
      const finalStatus: SessionStatus = (wasActive || (neverBecameActive && stderr))
        ? "error"
        : "closed";

      const errorMessage = stderr || (wasActive ? "CLI process exited unexpectedly during active turn" : "");

      execute(
        "UPDATE sessions SET status = $status, error_message = $error_message, closed_at = $now WHERE id = $id",
        {
          $status: finalStatus,
          $error_message: errorMessage,
          $now: new Date().toISOString(),
          $id: sessionId,
        },
      );

      if (finalStatus === "error") {
        const reason = neverBecameActive ? "cli_exited_before_connect" : "unexpected_exit";
        log.warn("Session error", { session_id: sessionId, reason, stderr: stderr.slice(0, 500) });
        eventBus.emit({
          type: "session.error",
          session_id: sessionId,
          data: { reason, error_message: errorMessage },
          timestamp: Date.now(),
        });
      }
    }
  },

  // Clean up orphaned sessions (called on startup)
  cleanupOrphanedSessions(): void {
    // Mark all non-closed sessions as closed since we're starting fresh
    const orphaned = queryAll<Session>(
      "SELECT * FROM sessions WHERE status != 'closed'",
    );

    if (orphaned.length > 0) {
      log.warn("Cleaning up orphaned sessions from previous run", { count: orphaned.length });
      for (const session of orphaned) {
        // Kill the orphaned CLI process if it's still running
        if (session.cli_pid) {
          try {
            process.kill(session.cli_pid, "SIGTERM");
            log.info("Killed orphaned CLI process", { id: session.id, pid: session.cli_pid });
          } catch (_err) {
            // Process already dead (ESRCH) or not owned — safe to ignore
          }
        }

        execute("UPDATE sessions SET status = $status, closed_at = $now WHERE id = $id", {
          $status: "error",
          $now: new Date().toISOString(),
          $id: session.id,
        });
        log.info("Marked orphaned session as error", {
          id: session.id,
          previous_status: session.status,
          cli_pid: session.cli_pid,
        });
      }
    }
  },

  // Shutdown all sessions (for graceful server shutdown)
  async shutdownAll(): Promise<void> {
    log.info("Shutting down all sessions", { count: activeSessions.size });
    const ids = Array.from(activeSessions.keys());
    for (const id of ids) {
      await this.kill(id);
    }
  },
};
