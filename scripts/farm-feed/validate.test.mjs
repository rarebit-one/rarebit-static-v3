// Tests for the farm-feed safety gate (validate.mjs). This is the component
// that decides what may be published; a regression here could leak a client
// identifier, so the invariant is locked here: REJECT (exit 1, nothing
// written) on any blocklisted name, URL/email/@handle, or fabricated number;
// PASS (exit 0, artifact written) on clean phrased input.
//
// Runs the real script as a subprocess against fixtures/sanitized.json, so it
// exercises the actual CLI path the nightly workflow uses.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const VALIDATE = join(here, "validate.mjs");
const SANITIZED = join(here, "fixtures", "sanitized.json");

// Run validate.mjs with a phrased payload; returns exit code + whether it
// wrote an artifact. Numbers in the fixture totals are { runs:23, systems:4,
// greenPct:96 }; blocklist includes "acme-payments" and "octocat".
function runValidate(phrased) {
  const dir = mkdtempSync(join(tmpdir(), "farmfeed-"));
  const phrasedPath = join(dir, "phrased.json");
  const outPath = join(dir, "out.json");
  writeFileSync(phrasedPath, JSON.stringify(phrased));
  const res = spawnSync("node", [VALIDATE, SANITIZED, phrasedPath, outPath], { encoding: "utf8" });
  const wrote = existsSync(outPath);
  const artifact = wrote ? JSON.parse(readFileSync(outPath, "utf8")) : null;
  rmSync(dir, { recursive: true, force: true });
  return { code: res.status, stderr: res.stderr, wrote, artifact };
}

// Only allowed numbers (23/4/96) and generic, identifier-free phrasing.
const CLEAN = {
  digest: "23 runs across 4 systems, 96% green.",
  phrases: {
    deploy: ["shipped a release"],
    tests: ["ran the test suite"],
    "scheduled job": ["ran a scheduled job"],
    "data pipeline": ["refreshed a data pipeline"],
  },
};

test("passes clean phrased input and writes the artifact", () => {
  const { code, wrote } = runValidate(CLEAN);
  assert.equal(code, 0);
  assert.ok(wrote, "expected an artifact to be written on pass");
});

test("assembles the artifact from validated templates (the safety contract)", () => {
  const { artifact } = runValidate(CLEAN);
  // One published event per sanitized event (fixture has 5), tagged window.
  assert.equal(artifact.window, "2026-06-07");
  assert.equal(artifact.events.length, 5);
  // Every published text is template-derived (+ ×count / · failed suffixes) —
  // never free-form model output, never an identifier.
  const templates = Object.values(CLEAN.phrases).flat();
  for (const event of artifact.events) {
    assert.ok(
      templates.some((t) => event.text.startsWith(t)),
      `published text "${event.text}" is not derived from a phrase template`
    );
  }
  // The failed data-pipeline event carries the outcome suffix; a counted one
  // carries ×N — proves the assembler, not the model, owns the published shape.
  assert.ok(artifact.events.some((e) => e.text.endsWith("· failed")));
  assert.ok(artifact.events.some((e) => /×\d+$/.test(e.text)));
  // The artifact now carries the deterministic gather totals + categories so
  // the live dashboard can render headline metrics + a category breakdown.
  // These come straight from sanitized.json — they never pass through the LLM.
  assert.deepEqual(artifact.totals, { runs: 23, systems: 4, greenPct: 96 });
  assert.deepEqual(artifact.categories, ["deploy", "tests", "scheduled job", "data pipeline"]);
});

test("rejects a blocklisted identifier", () => {
  const { code, wrote } = runValidate({
    ...CLEAN,
    digest: "Big week for acme-payments — lots shipped.",
  });
  assert.equal(code, 1);
  assert.ok(!wrote, "must not write when a blocklisted name leaks");
});

test("rejects a URL / @handle", () => {
  const { code, wrote } = runValidate({
    ...CLEAN,
    phrases: { ...CLEAN.phrases, deploy: ["shipped — details at https://example.com"] },
  });
  assert.equal(code, 1);
  assert.ok(!wrote);
});

test("rejects an @handle", () => {
  const { code } = runValidate({ ...CLEAN, digest: "Shipped, thanks @teamlead!" });
  assert.equal(code, 1);
});

test("rejects a fabricated number not in the sanitized totals", () => {
  const { code, wrote } = runValidate({
    ...CLEAN,
    digest: "Served 500 clients this week across 23 runs.",
  });
  assert.equal(code, 1);
  assert.ok(!wrote, "must not write when an unbacked number appears");
});
