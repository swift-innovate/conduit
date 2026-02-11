// ── /api/sessions endpoints ──

import { Hono } from "hono";
import { engine } from "../core/engine";
import { errorResponse } from "../utils/errors";

export const sessionRoutes = new Hono();

// NOTE: POST/GET /projects/:id/sessions are now in projects.ts (mounted at /projects)

// List all active (non-closed, non-error) sessions across all projects
sessionRoutes.get("/sessions/active", (c) => {
  try {
    const sessions = engine.sessions.listActive();
    return c.json(sessions);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return c.json(body, status as any);
  }
});

// Get session details
sessionRoutes.get("/sessions/:id", (c) => {
  try {
    const session = engine.sessions.getByIdOrThrow(c.req.param("id"));
    return c.json(session);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return c.json(body, status as any);
  }
});

// Send message to session
sessionRoutes.post("/sessions/:id/message", async (c) => {
  try {
    const { content } = await c.req.json();
    if (!content) {
      return c.json({ error: "VALIDATION_ERROR", message: "content is required" }, 400);
    }
    engine.sessions.sendMessage(c.req.param("id"), content);
    return c.json({ ok: true });
  } catch (err) {
    const { status, body } = errorResponse(err);
    return c.json(body, status as any);
  }
});

// Interrupt current turn
sessionRoutes.post("/sessions/:id/interrupt", (c) => {
  try {
    engine.sessions.interrupt(c.req.param("id"));
    return c.json({ ok: true });
  } catch (err) {
    const { status, body } = errorResponse(err);
    return c.json(body, status as any);
  }
});

// Get session messages
sessionRoutes.get("/sessions/:id/messages", (c) => {
  try {
    const limit = parseInt(c.req.query("limit") ?? "100");
    const offset = parseInt(c.req.query("offset") ?? "0");
    const messages = engine.sessions.getMessages(c.req.param("id"), limit, offset);
    return c.json(messages);
  } catch (err) {
    const { status, body } = errorResponse(err);
    return c.json(body, status as any);
  }
});

// Kill session
sessionRoutes.delete("/sessions/:id", async (c) => {
  try {
    await engine.sessions.kill(c.req.param("id"));
    return c.json({ ok: true });
  } catch (err) {
    const { status, body } = errorResponse(err);
    return c.json(body, status as any);
  }
});

// SSE stream of session events
sessionRoutes.get("/sessions/:id/stream", (c) => {
  try {
    const sessionId = c.req.param("id");
    engine.sessions.getByIdOrThrow(sessionId);

    return new Response(
      new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();

          const send = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          };

          // Send initial connection event
          send("connected", { session_id: sessionId });

          // Subscribe to session events
          const unsubscribe = engine.events.subscribe((event) => {
            send(event.type, event.data);
          }, sessionId);

          // Handle client disconnect
          c.req.raw.signal.addEventListener("abort", () => {
            unsubscribe();
          });
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      },
    );
  } catch (err) {
    const { status, body } = errorResponse(err);
    return c.json(body, status as any);
  }
});
