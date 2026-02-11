// ── /api/health endpoint ──

import { Hono } from "hono";
import { engine } from "../core/engine";

export const healthRoutes = new Hono();

healthRoutes.get("/health", (c) => {
  const health = engine.health();
  const statusCode = health.status === "unhealthy" ? 503 : 200;
  return c.json({
    status: health.status,
    timestamp: new Date().toISOString(),
    checks: health,
  }, statusCode);
});

