import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NdjsonParser, serializeNdjson } from "../src/bridge/ndjson";

describe("serializeNdjson", () => {
  it("should serialize an object to a JSON line with trailing newline", () => {
    const result = serializeNdjson({ type: "user", content: "hello" });
    assert.equal(result, '{"type":"user","content":"hello"}\n');
  });

  it("should handle primitive values", () => {
    assert.equal(serializeNdjson(42), "42\n");
    assert.equal(serializeNdjson("hello"), '"hello"\n');
    assert.equal(serializeNdjson(null), "null\n");
  });
});

describe("NdjsonParser", () => {
  it("should parse a single complete line", () => {
    const messages: unknown[] = [];
    const parser = new NdjsonParser((msg) => messages.push(msg));

    parser.feed('{"type":"user","content":"hello"}\n');

    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], { type: "user", content: "hello" });
  });

  it("should parse multiple lines in one chunk", () => {
    const messages: unknown[] = [];
    const parser = new NdjsonParser((msg) => messages.push(msg));

    parser.feed('{"a":1}\n{"b":2}\n{"c":3}\n');

    assert.equal(messages.length, 3);
    assert.deepEqual(messages[0], { a: 1 });
    assert.deepEqual(messages[1], { b: 2 });
    assert.deepEqual(messages[2], { c: 3 });
  });

  it("should handle partial/split messages across chunks", () => {
    const messages: unknown[] = [];
    const parser = new NdjsonParser((msg) => messages.push(msg));

    parser.feed('{"type":"us');
    assert.equal(messages.length, 0);

    parser.feed('er","content":"hi"}\n');
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], { type: "user", content: "hi" });
  });

  it("should handle empty lines", () => {
    const messages: unknown[] = [];
    const parser = new NdjsonParser((msg) => messages.push(msg));

    parser.feed('\n\n{"a":1}\n\n{"b":2}\n\n');

    assert.equal(messages.length, 2);
    assert.deepEqual(messages[0], { a: 1 });
    assert.deepEqual(messages[1], { b: 2 });
  });

  it("should flush remaining buffer content", () => {
    const messages: unknown[] = [];
    const parser = new NdjsonParser((msg) => messages.push(msg));

    // Feed data without trailing newline
    parser.feed('{"flushed":true}');
    assert.equal(messages.length, 0);

    parser.flush();
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], { flushed: true });
  });

  it("should silently skip malformed JSON lines", () => {
    const messages: unknown[] = [];
    const parser = new NdjsonParser((msg) => messages.push(msg));

    parser.feed('{"valid":1}\nnot-json\n{"valid":2}\n');

    assert.equal(messages.length, 2);
    assert.deepEqual(messages[0], { valid: 1 });
    assert.deepEqual(messages[1], { valid: 2 });
  });

  it("should silently skip malformed data on flush", () => {
    const messages: unknown[] = [];
    const parser = new NdjsonParser((msg) => messages.push(msg));

    parser.feed("this is not json");
    parser.flush();

    assert.equal(messages.length, 0);
  });

  it("should handle whitespace-only lines", () => {
    const messages: unknown[] = [];
    const parser = new NdjsonParser((msg) => messages.push(msg));

    parser.feed('   \n  \n{"a":1}\n');

    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], { a: 1 });
  });

  it("should not emit anything on flush when buffer is empty", () => {
    const messages: unknown[] = [];
    const parser = new NdjsonParser((msg) => messages.push(msg));

    parser.flush();
    assert.equal(messages.length, 0);
  });

  it("should handle multiple feeds building up a single message", () => {
    const messages: unknown[] = [];
    const parser = new NdjsonParser((msg) => messages.push(msg));

    parser.feed("{");
    parser.feed('"key"');
    parser.feed(":");
    parser.feed('"value"');
    parser.feed("}\n");

    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], { key: "value" });
  });
});
