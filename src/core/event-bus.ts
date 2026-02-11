// ── Internal pub/sub for real-time streaming ──

import type { ConduitEvent, EventType } from "./types";
import { logger } from "../utils/logger";

const log = logger.create("event-bus");

type EventHandler = (event: ConduitEvent) => void;

interface Subscription {
  id: string;
  sessionId?: string; // if set, only receive events for this session
  handler: EventHandler;
}

let subCounter = 0;
const subscriptions = new Map<string, Subscription>();

export const eventBus = {
  /**
   * Subscribe to events. Optionally filter by session ID.
   * Returns an unsubscribe function.
   */
  subscribe(handler: EventHandler, sessionId?: string): () => void {
    const id = `sub_${++subCounter}`;
    subscriptions.set(id, { id, sessionId, handler });
    log.debug("Subscription added", { id, sessionId });
    return () => {
      subscriptions.delete(id);
      log.debug("Subscription removed", { id });
    };
  },

  /**
   * Emit an event to all matching subscribers.
   */
  emit(event: ConduitEvent) {
    log.debug("Event emitted", { type: event.type, session_id: event.session_id });
    for (const sub of subscriptions.values()) {
      if (sub.sessionId && sub.sessionId !== event.session_id) continue;
      try {
        sub.handler(event);
      } catch (err) {
        log.error("Subscriber error", {
          subscription: sub.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  },

  /**
   * Get current subscriber count.
   */
  subscriberCount(): number {
    return subscriptions.size;
  },

  /**
   * Clear all subscriptions (for testing/shutdown).
   */
  clear() {
    subscriptions.clear();
  },
};
