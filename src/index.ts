// ── Entry point — starts Hono server ──

import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { config } from "./config";
import { engine } from "./core/engine";
import { createApp } from "./api/routes";
import { handleExternalWebSocket } from "./api/ws-external";
import { logger } from "./utils/logger";

const log = logger.create("server");

// Initialize engine (database, etc.)
engine.initialize();

// Create Hono app
const app = createApp();

// Set up Node.js WebSocket support via @hono/node-ws
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Export upgradeWebSocket for use in route handlers
export { upgradeWebSocket };

// Register external WebSocket route
app.get(
  "/api/sessions/:id/ws",
  upgradeWebSocket((c) => {
    const sessionId = c.req.param("id");
    let handler: ReturnType<typeof handleExternalWebSocket> | null = null;

    return {
      onOpen(_evt, ws) {
        handler = handleExternalWebSocket(ws, sessionId);
      },
      onMessage(evt, _ws) {
        if (handler) {
          const text = typeof evt.data === "string" ? evt.data : evt.data.toString();
          handler.onMessage(text);
        }
      },
      onClose(_evt, _ws) {
        if (handler) handler.onClose();
      },
    };
  }),
);

// Start server
const server = serve(
  {
    fetch: app.fetch,
    port: config.port,
    hostname: config.host,
  },
  (info) => {
    log.info("Conduit server started", {
      url: `http://${config.host}:${info.port}`,
      wsPortRange: `${config.wsPortRangeStart}-${config.wsPortRangeEnd}`,
    });
  },
);

// Inject WebSocket handling into the HTTP server
injectWebSocket(server);

// Graceful shutdown
process.on("SIGINT", async () => {
  log.info("Received SIGINT, shutting down...");
  await engine.shutdown();
  server.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  log.info("Received SIGTERM, shutting down...");
  await engine.shutdown();
  server.close();
  process.exit(0);
});
