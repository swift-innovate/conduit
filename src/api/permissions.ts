// ── /api/permissions endpoints ──

import { Hono } from "hono";
import { engine } from "../core/engine";
import { errorResponse } from "../utils/errors";

export const permissionRoutes = new Hono();

// Update a permission rule
permissionRoutes.put("/rules/:id", async (c) => {
  try {
    const body = await c.req.json();
    const rule = engine.permissions.updateRule(c.req.param("id"), body);
    if (!rule) {
      return c.json({ error: "NOT_FOUND", message: "Rule not found" }, 404);
    }
    return c.json(rule);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return c.json(body, status as any);
  }
});

// Delete a permission rule
permissionRoutes.delete("/rules/:id", (c) => {
  try {
    engine.permissions.deleteRule(c.req.param("id"));
    return c.json({ ok: true });
  } catch (err) {
    const { status, body } = errorResponse(err);
    return c.json(body, status as any);
  }
});

// Query audit log
permissionRoutes.get("/permissions/log", (c) => {
  const session_id = c.req.query("session_id");
  const limitParam = c.req.query("limit");
  const offsetParam = c.req.query("offset");

  const limit = limitParam ? parseInt(limitParam) : 100;
  const offset = offsetParam ? parseInt(offsetParam) : 0;

  const log = engine.permissions.getAuditLog({
    session_id,
    limit: isNaN(limit) ? 100 : limit,
    offset: isNaN(offset) ? 0 : offset
  });
  return c.json(log);
});

// Global permission rules
permissionRoutes.get("/rules/global", (c) => {
  const rules = engine.permissions.getGlobalRules();
  return c.json(rules);
});

permissionRoutes.post("/rules/global", async (c) => {
  try {
    const body = await c.req.json();
    const rule = engine.permissions.createRule(null, body);
    return c.json(rule, 201);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return c.json(body, status as any);
  }
});
