// ── WebSocket server that CLI connects to ──
// Each session gets its own WS server on a unique port.
// The CLI connects to this via --sdk-url ws://localhost:{port}

import { WebSocketServer, WebSocket } from "ws";
import { NdjsonParser, serializeNdjson } from "./ndjson";
import { routeMessage, type MessageRouterCallbacks } from "./message-router";
import type { ServerToCliMessage } from "./protocol";
import { logger } from "../utils/logger";

const log = logger.create("ws-server");

export interface BridgeServer {
  port: number;
  send: (message: ServerToCliMessage) => void;
  close: () => void;
  isConnected: () => boolean;
  onConnect: (callback: () => void) => void;
}

export function createBridgeServer(
  port: number,
  conduitSessionId: string,
  callbacks: MessageRouterCallbacks,
): Promise<BridgeServer> {
  return new Promise((resolve, reject) => {
    let clientWs: WebSocket | null = null;
    let connectCallback: (() => void) | null = null;

    const wss = new WebSocketServer({ port });

    wss.on("error", (err) => {
      log.error("Bridge WS server error", { port, error: String(err) });
      reject(err);
    });

    wss.on("listening", () => {
      log.info("Bridge WS server started", { port });

      const bridge: BridgeServer = {
        port,
        send(message: ServerToCliMessage) {
          if (clientWs && clientWs.readyState === WebSocket.OPEN) {
            try {
              const serialized = serializeNdjson(message);
              clientWs.send(serialized);
              log.info("Sent message to CLI", { port, type: message.type });
            } catch (err) {
              log.error("Failed to send message to CLI", {
                port,
                session_id: conduitSessionId,
                type: message.type,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          } else {
            log.warn("Cannot send: CLI not connected", { port, session_id: conduitSessionId, type: message.type });
          }
        },
        close() {
          wss.close();
          log.info("Bridge WS server stopped", { port });
        },
        isConnected() {
          return clientWs !== null && clientWs.readyState === WebSocket.OPEN;
        },
        onConnect(callback: () => void) {
          connectCallback = callback;
        },
      };

      resolve(bridge);
    });

    wss.on("connection", (ws: WebSocket) => {
      // If there's an existing connection, close it first
      if (clientWs && clientWs.readyState === WebSocket.OPEN) {
        log.warn("CLI reconnected — closing previous connection", { port, session_id: conduitSessionId });
        clientWs.close(1000, "Replaced by new connection");
      }

      log.info("CLI connected to bridge", { port, session_id: conduitSessionId });
      clientWs = ws;

      // Notify waiters that CLI has connected
      if (connectCallback) {
        connectCallback();
        connectCallback = null;
      }

      // Fresh parser for this connection — each connection is a new stream
      const parser = new NdjsonParser((msg) => {
        routeMessage(conduitSessionId, msg as any, callbacks);
      });

      ws.on("message", (data: Buffer) => {
        const text = data.toString();
        log.debug("Bridge received data from CLI", { port, bytes: text.length });
        // WebSocket frames may not end with \n, but the NDJSON parser requires
        // newlines as delimiters. Append \n to ensure each frame is processed.
        parser.feed(text.endsWith("\n") ? text : text + "\n");
      });

      ws.on("close", (code) => {
        log.info("CLI disconnected from bridge", { port, session_id: conduitSessionId, code });
        // Flush any remaining partial message in the NDJSON buffer
        parser.flush();
        // Only null out if this is still the current connection (prevents race conditions)
        if (clientWs === ws) {
          clientWs = null;
        }
      });

      ws.on("error", (err) => {
        log.warn("CLI WebSocket error", { port, session_id: conduitSessionId, error: String(err) });
      });
    });
  });
}
