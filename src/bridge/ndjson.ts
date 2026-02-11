// ── NDJSON parser/serializer ──
// NDJSON = Newline-Delimited JSON. Each line is a complete JSON object.

import { logger } from "../utils/logger";

const log = logger.create("ndjson");

export function serializeNdjson(obj: unknown): string {
  return JSON.stringify(obj) + "\n";
}

export class NdjsonParser {
  private buffer = "";
  private onMessage: (msg: unknown) => void;

  constructor(onMessage: (msg: unknown) => void) {
    this.onMessage = onMessage;
  }

  feed(chunk: string) {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    // Keep incomplete last line in buffer
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        log.debug("Parsed NDJSON message", { type: (parsed as any).type ?? "unknown" });
        this.onMessage(parsed);
      } catch (err) {
        log.warn("Malformed NDJSON line (skipped)", {
          line: trimmed.slice(0, 200),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  flush() {
    if (this.buffer.trim()) {
      try {
        const parsed = JSON.parse(this.buffer.trim());
        log.debug("Flushed NDJSON message", { type: (parsed as any).type ?? "unknown" });
        this.onMessage(parsed);
      } catch (err) {
        log.warn("Malformed NDJSON in flush buffer (discarded)", {
          buffer: this.buffer.trim().slice(0, 200),
          error: err instanceof Error ? err.message : String(err),
        });
      }
      this.buffer = "";
    }
  }
}
