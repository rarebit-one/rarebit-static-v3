// Tests for the request body callLLM sends (#610): the optional per-call
// `temperature` is passed through when given and omitted otherwise, so callers
// that don't set it keep the API default.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { callLLM } from "./llm.mjs";

let realFetch;
let sent;

beforeEach(() => {
  realFetch = globalThis.fetch;
  sent = undefined;
  globalThis.fetch = async (_url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 });
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("temperature is omitted by default", async () => {
  await callLLM({ system: "s", prompt: "p", json: true });
  assert.ok(!("temperature" in sent), "default request must not set temperature");
  assert.deepEqual(sent.response_format, { type: "json_object" });
});

test("temperature 0 is passed through", async () => {
  await callLLM({ system: "s", prompt: "p", temperature: 0 });
  assert.equal(sent.temperature, 0);
});
