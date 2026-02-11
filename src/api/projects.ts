// ── /api/projects endpoints ──
// Mounted at /projects in routes.ts, so all paths here are relative to /projects

import { Hono } from "hono";
import { resolve } from "path";
import { engine } from "../core/engine";
import { config } from "../config";
import { errorResponse } from "../utils/errors";

export const projectRoutes = new Hono();

// Create a project  (POST /api/projects)
projectRoutes.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const project = engine.projects.create(body);
    return c.json(project, 201);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return c.json(body, status as any);
  }
});

// List all projects  (GET /api/projects)
projectRoutes.get("/", (c) => {
  const projects = engine.projects.list();
  return c.json(projects);
});

// ── Discovery, Import ──
// These must be registered BEFORE /:id to avoid wildcard conflicts

// Discover projects in a folder  (GET /api/projects/discover?path=...)
projectRoutes.get("/discover", (c) => {
  try {
    const path = c.req.query("path");
    if (!path) {
      return c.json({ error: "VALIDATION_ERROR", message: "path query parameter is required" }, 400);
    }
    const discovered = engine.projects.discover(path);
    return c.json(discovered);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return c.json(body, status as any);
  }
});

// Import an existing project  (POST /api/projects/import)
projectRoutes.post("/import", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.folder_path) {
      return c.json({ error: "VALIDATION_ERROR", message: "folder_path is required" }, 400);
    }
    const project = engine.projects.importProject(body);
    return c.json(project, 201);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return c.json(body, status as any);
  }
});

// ── Project CRUD by ID ──

// Get project details  (GET /api/projects/:id)
projectRoutes.get("/:id", (c) => {
  try {
    const project = engine.projects.getByIdOrThrow(c.req.param("id"));
    return c.json(project);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return c.json(body, status as any);
  }
});

// Update project settings  (PUT /api/projects/:id)
projectRoutes.put("/:id", async (c) => {
  try {
    const body = await c.req.json();
    const project = engine.projects.update(c.req.param("id"), body);
    return c.json(project);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return c.json(body, status as any);
  }
});

// Delete project  (DELETE /api/projects/:id)
projectRoutes.delete("/:id", async (c) => {
  try {
    // Kill all sessions for this project first
    const sessions = engine.sessions.listByProject(c.req.param("id"));
    for (const session of sessions) {
      if (engine.sessions.isActive(session.id)) {
        await engine.sessions.kill(session.id);
      }
    }
    engine.projects.delete(c.req.param("id"));
    return c.json({ ok: true });
  } catch (err) {
    const { status, body } = errorResponse(err);
    return c.json(body, status as any);
  }
});

// ── Permission rules for project ──

// GET /api/projects/:id/rules
projectRoutes.get("/:id/rules", (c) => {
  try {
    engine.projects.getByIdOrThrow(c.req.param("id"));
    const rules = engine.permissions.getRulesForProject(c.req.param("id"));
    return c.json(rules);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return c.json(body, status as any);
  }
});

// POST /api/projects/:id/rules
projectRoutes.post("/:id/rules", async (c) => {
  try {
    engine.projects.getByIdOrThrow(c.req.param("id"));
    const body = await c.req.json();
    const rule = engine.permissions.createRule(c.req.param("id"), body);
    return c.json(rule, 201);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return c.json(body, status as any);
  }
});

// ── Sessions under project (must be here since mounted at /projects) ──

// Launch new session  (POST /api/projects/:id/sessions)
projectRoutes.post("/:id/sessions", async (c) => {
  try {
    const project = engine.projects.getByIdOrThrow(c.req.param("id"));
    const body = await c.req.json().catch(() => ({}));
    const session = await engine.sessions.create(c.req.param("id"), project, body);
    return c.json(session, 201);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return c.json(body, status as any);
  }
});

// List sessions for project  (GET /api/projects/:id/sessions)
projectRoutes.get("/:id/sessions", (c) => {
  try {
    engine.projects.getByIdOrThrow(c.req.param("id"));
    const sessions = engine.sessions.listByProject(c.req.param("id"));
    return c.json(sessions);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return c.json(body, status as any);
  }
});
