// ── External WebSocket endpoint for consumers ──
// Consumers (VALOR, OpenClaw, Web UI) connect to /api/sessions/:id/ws

import { engine } from "../core/engine";
import { logger } from "../utils/logger";
import type { ServerEvent } from "../core/types";

const log = logger.create("ws-external");

export function handleExternalWebSocket(ws: any, sessionId: string) {
  log.info("External client connected", { session_id: sessionId });

  // Check if session exists and is active
  try {
    const session = engine.sessions.getByIdOrThrow(sessionId);
    const isActiveInMemory = engine.sessions.isActive(sessionId);

    if (!isActiveInMemory) {
      // CLI process is not running, but database shows it exists
      const statusMsg = session.status === "closed"
        ? "Session has been closed"
        : session.status === "error"
        ? "Session encountered an error and stopped"
        : "CLI process is not running (may have crashed or failed to start)";

      log.warn("Client connected to session without active CLI process", {
        session_id: sessionId,
        db_status: session.status,
        cli_pid: session.cli_pid
      });

      ws.send(JSON.stringify({
        event: "error",
        message: `${statusMsg}. Database status: ${session.status}. Try creating a new session.`
      }));
    }
  } catch (err: any) {
    log.error("Session not found for WebSocket connection", { session_id: sessionId });
    ws.send(JSON.stringify({ event: "error", message: "Session not found" }));
    ws.close();
    return {
      onMessage: () => {},
      onClose: () => {},
    };
  }

  // Subscribe to session events
  const unsubscribe = engine.events.subscribe((event) => {
    try {
      const serverEvent = mapToServerEvent(event);
      if (serverEvent) {
        ws.send(JSON.stringify(serverEvent));
      }
    } catch {
      // Client may have disconnected
    }
  }, sessionId);

  // Send connected event
  ws.send(JSON.stringify({ event: "connected", session_id: sessionId }));

  return {
    onMessage(rawMessage: string) {
      try {
        const msg = JSON.parse(rawMessage);

        switch (msg.action) {
          case "message":
            if (!msg.content) {
              ws.send(JSON.stringify({ event: "error", message: "Missing message content" }));
              return;
            }
            try {
              engine.sessions.sendMessage(sessionId, msg.content);
            } catch (err: any) {
              ws.send(JSON.stringify({ event: "error", message: err.message || "Failed to send message" }));
            }
            break;

          case "interrupt":
            try {
              engine.sessions.interrupt(sessionId);
            } catch (err: any) {
              ws.send(JSON.stringify({ event: "error", message: err.message || "Failed to interrupt" }));
            }
            break;

          default:
            ws.send(JSON.stringify({ event: "error", message: `Unknown action: ${msg.action}` }));
        }
      } catch (err: any) {
        const message = err instanceof SyntaxError ? "Invalid JSON" : (err.message || "Invalid message format");
        ws.send(JSON.stringify({ event: "error", message }));
        log.error("WebSocket message error", { session_id: sessionId, error: message });
      }
    },

    onClose() {
      unsubscribe();
      log.info("External client disconnected", { session_id: sessionId });
    },
  };
}

function mapToServerEvent(event: any): ServerEvent | null {
  switch (event.type) {
    case "session.message": {
      const data = event.data;
      // CLI v2.1.39 sends type="system" with subtype="init" (not "system_init")
      if (data?.type === "system" && data?.subtype === "init") {
        return { event: "system_init", data };
      }
      if (data?.type === "assistant") {
        return { event: "assistant", data };
      }
      return null;
    }

    case "stream.event":
      return { event: "stream_event", data: event.data };

    case "session.result":
      return { event: "result", data: event.data };

    case "session.status":
      return { event: "session_status", status: event.data.status };

    case "session.error":
      return { event: "error", message: event.data.message ?? "Session error" };

    default:
      return null;
  }
}
