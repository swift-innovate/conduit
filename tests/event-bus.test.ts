import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eventBus } from "../src/core/event-bus";
import type { ConduitEvent } from "../src/core/types";

function makeEvent(overrides: Partial<ConduitEvent> = {}): ConduitEvent {
  return {
    type: "session.message",
    session_id: "session-1",
    data: { content: "test" },
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("EventBus", () => {
  beforeEach(() => {
    eventBus.clear();
  });

  it("should deliver events to subscribers", () => {
    const received: ConduitEvent[] = [];
    eventBus.subscribe((event) => received.push(event));

    const event = makeEvent();
    eventBus.emit(event);

    assert.equal(received.length, 1);
    assert.deepEqual(received[0], event);
  });

  it("should deliver events to multiple subscribers", () => {
    const received1: ConduitEvent[] = [];
    const received2: ConduitEvent[] = [];
    eventBus.subscribe((event) => received1.push(event));
    eventBus.subscribe((event) => received2.push(event));

    const event = makeEvent();
    eventBus.emit(event);

    assert.equal(received1.length, 1);
    assert.equal(received2.length, 1);
  });

  it("should filter events by session ID", () => {
    const received: ConduitEvent[] = [];
    eventBus.subscribe((event) => received.push(event), "session-A");

    eventBus.emit(makeEvent({ session_id: "session-A" }));
    eventBus.emit(makeEvent({ session_id: "session-B" }));
    eventBus.emit(makeEvent({ session_id: "session-A" }));

    assert.equal(received.length, 2);
    assert.equal(received[0].session_id, "session-A");
    assert.equal(received[1].session_id, "session-A");
  });

  it("should deliver all events to subscribers without session filter", () => {
    const received: ConduitEvent[] = [];
    eventBus.subscribe((event) => received.push(event));

    eventBus.emit(makeEvent({ session_id: "session-A" }));
    eventBus.emit(makeEvent({ session_id: "session-B" }));

    assert.equal(received.length, 2);
  });

  it("should stop delivery after unsubscribe", () => {
    const received: ConduitEvent[] = [];
    const unsub = eventBus.subscribe((event) => received.push(event));

    eventBus.emit(makeEvent());
    assert.equal(received.length, 1);

    unsub();

    eventBus.emit(makeEvent());
    assert.equal(received.length, 1); // still 1, not 2
  });

  it("should isolate errors between subscribers", () => {
    const received: ConduitEvent[] = [];

    // First subscriber throws
    eventBus.subscribe(() => {
      throw new Error("subscriber failure");
    });

    // Second subscriber should still receive events
    eventBus.subscribe((event) => received.push(event));

    const event = makeEvent();
    // Should not throw
    eventBus.emit(event);

    assert.equal(received.length, 1);
    assert.deepEqual(received[0], event);
  });

  it("should track subscriber count", () => {
    assert.equal(eventBus.subscriberCount(), 0);

    const unsub1 = eventBus.subscribe(() => {});
    assert.equal(eventBus.subscriberCount(), 1);

    const unsub2 = eventBus.subscribe(() => {});
    assert.equal(eventBus.subscriberCount(), 2);

    unsub1();
    assert.equal(eventBus.subscriberCount(), 1);

    unsub2();
    assert.equal(eventBus.subscriberCount(), 0);
  });

  it("should clear all subscriptions", () => {
    eventBus.subscribe(() => {});
    eventBus.subscribe(() => {});
    assert.equal(eventBus.subscriberCount(), 2);

    eventBus.clear();
    assert.equal(eventBus.subscriberCount(), 0);
  });
});
