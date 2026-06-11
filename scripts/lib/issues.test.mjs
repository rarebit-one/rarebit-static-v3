// Unit tests for the PURE helpers in issues.mjs (the sensors/actors issue
// contract). No network: only buildMarker / parseMarker / dedupeBy are
// exercised — the IO helpers (gh shell-outs) are covered by integration, not
// here. Picked up automatically by the `scripts/**/*.test.mjs` test glob.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMarker, parseMarker, dedupeBy } from "./issues.mjs";

test("buildMarker → parseMarker round-trips a payload", () => {
  const data = { angle: "small teams, impossible things", grounding: ["https://example.com/pr/1"] };
  const marker = buildMarker("voice-proposal", data);
  const parsed = parseMarker(marker, "voice-proposal");
  assert.ok(parsed, "expected a parsed marker");
  assert.equal(parsed.type, "voice-proposal");
  assert.deepEqual(parsed.data, data);
});

test("buildMarker → parseMarker round-trips values with tricky characters", () => {
  // Quotes, a newline, an HTML-comment-adjacent sequence, unicode, and braces —
  // all must survive JSON encoding and the marker regex.
  const data = {
    text: 'he said "hi" \n then <!-- not a real marker --> & {nested: braces}',
    emoji: "🤖",
    url: "https://example.com/a)b]c",
  };
  const marker = buildMarker("drift", data);
  const parsed = parseMarker(marker, "drift");
  assert.ok(parsed, "expected a parsed marker");
  assert.deepEqual(parsed.data, data);
});

test("parseMarker matches any type when type is omitted", () => {
  const marker = buildMarker("task", { id: 7 });
  const parsed = parseMarker(`prose above\n${marker}\nprose below`);
  assert.ok(parsed);
  assert.equal(parsed.type, "task");
  assert.deepEqual(parsed.data, { id: 7 });
});

test("parseMarker returns null for the wrong type", () => {
  const marker = buildMarker("task", { id: 7 });
  assert.equal(parseMarker(marker, "voice-proposal"), null);
});

test("parseMarker returns null when no marker is present", () => {
  assert.equal(parseMarker("just a plain issue body, no marker here"), null);
  assert.equal(parseMarker(""), null);
  assert.equal(parseMarker(null), null);
});

test("parseMarker returns null on malformed JSON in the marker", () => {
  assert.equal(parseMarker("<!-- task:{not valid json} -->"), null);
});

test("dedupeBy drops candidates whose key already exists", () => {
  const existing = [{ url: "a" }, { url: "b" }];
  const candidates = [{ url: "b" }, { url: "c" }, { url: "a" }];
  const out = dedupeBy(existing, candidates, (x) => x.url);
  assert.deepEqual(out, [{ url: "c" }]);
});

test("dedupeBy keeps all candidates when nothing collides", () => {
  const out = dedupeBy([{ url: "a" }], [{ url: "b" }, { url: "c" }], (x) => x.url);
  assert.deepEqual(out, [{ url: "b" }, { url: "c" }]);
});

test("dedupeBy dedupes within the candidate batch itself", () => {
  const out = dedupeBy([], [{ url: "a" }, { url: "a" }, { url: "b" }], (x) => x.url);
  assert.deepEqual(out, [{ url: "a" }, { url: "b" }]);
});

test("dedupeBy supports multi-key candidates (any key collision is a dup)", () => {
  const existing = [{ urls: ["x"] }];
  const candidates = [{ urls: ["y", "x"] }, { urls: ["z"] }];
  const out = dedupeBy(existing, candidates, (c) => c.urls);
  assert.deepEqual(out, [{ urls: ["z"] }]);
});

test("dedupeBy ignores falsy keys (never treated as a dup)", () => {
  const out = dedupeBy([{ url: null }], [{ url: null }, { url: "" }], (x) => x.url);
  assert.deepEqual(out, [{ url: null }, { url: "" }]);
});
