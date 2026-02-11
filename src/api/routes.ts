// ── Hono route registration ──

import { resolve } from "path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { healthRoutes } from "./health";
import { projectRoutes } from "./projects";
import { sessionRoutes } from "./sessions";
import { permissionRoutes } from "./permissions";
import { engine } from "../core/engine";
import { config } from "../config";
import { generateId } from "../utils/uuid";
import { execute } from "../db/database";
import { errorResponse } from "../utils/errors";

export function createApp() {
  const app = new Hono();

  // CORS
  app.use("/*", cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }));

  // API routes
  const api = new Hono();

  // IMPORTANT: Mount sub-routers at their base paths, NOT at "/".
  // Mounting all at "/" causes Hono to lose named parameter context
  // when multiple sub-routers define overlapping parameterized routes
  // (e.g., /projects/:id in projectRoutes and /projects/:id/sessions in sessionRoutes).
  api.route("/", healthRoutes);
  api.route("/projects", projectRoutes);
  api.route("/", sessionRoutes);
  api.route("/", permissionRoutes);

  // ── Folder browsing (not under /projects, so registered directly) ──
  api.get("/folders/browse", (c) => {
    try {
      const pathParam = c.req.query("path") || undefined;
      const entries = engine.projects.browse(pathParam);
      const resolvedPath = resolve(pathParam || config.projectRoot || "");
      return c.json({ path: resolvedPath, entries });
    } catch (err) {
      const { status, body } = errorResponse(err);
      return c.json(body, status as any);
    }
  });

  // ── Webhook management ──
  api.post("/webhooks", async (c) => {
    try {
      const { name, url, events, secret } = await c.req.json();
      if (!name || !url) {
        return c.json({ error: "VALIDATION_ERROR", message: "name and url are required" }, 400);
      }

      const id = generateId();
      execute(
        `INSERT INTO webhooks (id, name, url, events, secret, active, created_at)
         VALUES ($id, $name, $url, $events, $secret, 1, $created_at)`,
        {
          $id: id,
          $name: name,
          $url: url,
          $events: JSON.stringify(events ?? []),
          $secret: secret ?? "",
          $created_at: new Date().toISOString(),
        },
      );

      return c.json({ id, name, url }, 201);
    } catch (err) {
      const { status, body } = errorResponse(err);
      return c.json(body, status as any);
    }
  });

  api.delete("/webhooks/:id", (c) => {
    execute("DELETE FROM webhooks WHERE id = $id", { $id: c.req.param("id") });
    return c.json({ ok: true });
  });

  // ── Catch-all: return API usage for any unmatched route ──
  api.all("/*", (c) => {
    return c.json({
      name: "Conduit API",
      version: "0.1.0",
      description: "Claude Code WebSocket Orchestration Platform",
      docs: "See API.md for full documentation",
      endpoints: {
        health: {
          "GET /api/health": "Service health check with detailed status",
        },
        projects: {
          "POST /api/projects": "Create a project",
          "GET /api/projects": "List all projects",
          "GET /api/projects/:id": "Get project details",
          "PUT /api/projects/:id": "Update project settings",
          "DELETE /api/projects/:id": "Delete project",
          "GET /api/projects/discover?path=...": "Scan folder for projects",
          "POST /api/projects/import": "Import existing project",
          "GET /api/folders/browse?path=...": "Browse filesystem directories",
        },
        sessions: {
          "POST /api/projects/:id/sessions": "Launch new session",
          "GET /api/projects/:id/sessions": "List sessions for project",
          "GET /api/sessions/active": "List all active sessions across projects",
          "GET /api/sessions/:id": "Get session details",
          "POST /api/sessions/:id/message": "Send message to session",
          "POST /api/sessions/:id/interrupt": "Interrupt current turn",
          "DELETE /api/sessions/:id": "Kill session",
          "GET /api/sessions/:id/messages": "Get message history",
          "GET /api/sessions/:id/stream": "SSE event stream",
          "WS /api/sessions/:id/ws": "WebSocket bidirectional",
        },
        permissions: {
          "GET /api/sessions/:id/permissions": "Get pending permission requests",
          "POST /api/sessions/:id/permissions/:rid": "Respond to permission request",
          "GET /api/projects/:id/rules": "List project permission rules",
          "POST /api/projects/:id/rules": "Create project permission rule",
          "GET /api/rules/global": "List global permission rules",
          "POST /api/rules/global": "Create global permission rule",
          "PUT /api/rules/:id": "Update permission rule",
          "DELETE /api/rules/:id": "Delete permission rule",
          "GET /api/permissions/log": "Query audit log",
        },
        webhooks: {
          "POST /api/webhooks": "Register webhook",
          "DELETE /api/webhooks/:id": "Remove webhook",
        },
      },
    }, 404);
  });

  app.route("/api", api);

  // ── Root handler: direct users to the API ──
  app.get("/", (c) => {
    return c.json({
      name: "Conduit",
      description: "Claude Code WebSocket Orchestration Platform",
      api: "/api",
      health: "/api/health",
    });
  });

  return app;
}
