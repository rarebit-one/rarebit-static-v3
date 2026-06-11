// Tests for the notebook safety gate (validate.mjs). Because the daily workflow
// turns these seeds straight into PUBLIC GitHub issues with NO human review
// between curate and publish, this gate is the only thing standing between an
// LLM's idea-seeds and a public issue (which a future weekly field note may
// then mine). A regression here could surface a client identifier or an
// off-facts link in a public issue. The invariant is locked here: REJECT
// (exit 1, nothing written) on any blocklisted identifier, email/@handle, or
// off-allowlist URL; PASS (exit 0, validated-seeds.json written with the
// passing seeds) on clean seeds.
//
// Runs the real script as a subprocess against fixtures/notebook-raw.json, so it
// exercises the actual CLI path the daily workflow uses. validate.mjs is now
// pure (no network, no merge) — it only screens and emits the seeds.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const VALIDATE = join(here, "validate.mjs");
const RAW = join(here, "fixtures", "notebook-raw.json");

// Run validate.mjs with curated seeds, writing into a temp dir so nothing real
// is touched. The fixture's blocklist includes "acme-payments" and "octocat";
// its public URLs cover PR #40 on rarebit-static-v3, a standard_ledger release,
// and a standard_id commit.
function runValidate(seeds) {
  const dir = mkdtempSync(join(tmpdir(), "notebook-"));
  const seedsPath = join(dir, "seeds.json");
  const outPath = join(dir, "validated-seeds.json");
  writeFileSync(seedsPath, JSON.stringify(seeds));
  const res = spawnSync("node", [VALIDATE, RAW, seedsPath, outPath], { encoding: "utf8" });
  const wrote = existsSync(outPath);
  const validated = wrote ? JSON.parse(readFileSync(outPath, "utf8")) : null;
  rmSync(dir, { recursive: true, force: true });
  return { code: res.status, stderr: res.stderr, wrote, validated };
}

// Clean seeds: angles grounded only in allowlisted public URLs + one purely
// generic private observation (empty grounding).
const CLEAN = {
  seeds: [
    {
      angle: "How a small ledger release tightened aggregate projections",
      grounding: ["https://github.com/rarebit-one/standard_ledger/releases/tag/v0.5.0"],
    },
    {
      angle: "The scout that fills this notebook, end to end",
      grounding: ["https://github.com/rarebit-one/rarebit-static-v3/pull/40"],
    },
    {
      angle: "A quiet, all-green week of scheduled data pipelines",
      grounding: [],
    },
  ],
};

test("passes clean seeds and writes validated-seeds.json with the seeds", () => {
  const { code, wrote, validated } = runValidate(CLEAN);
  assert.equal(code, 0);
  assert.ok(wrote, "expected validated-seeds.json to be written on pass");
  assert.equal(validated.seeds.length, 3);
  // Each emitted seed is normalized to { angle, grounding } — no timestamps,
  // no merge artifacts — and the angle survives intact.
  for (const seed of validated.seeds) {
    assert.equal(typeof seed.angle, "string");
    assert.ok(Array.isArray(seed.grounding));
  }
  const angles = validated.seeds.map((s) => s.angle);
  assert.ok(angles.includes("The scout that fills this notebook, end to end"));
});

test("rejects a blocklisted identifier in a seed angle", () => {
  const { code, wrote } = runValidate({
    seeds: [{ angle: "A big week for acme-payments and their pipeline", grounding: [] }],
  });
  assert.equal(code, 1);
  assert.ok(!wrote, "must not write when a blocklisted name leaks");
});

test("passes a superstring of a blocklisted term (boundary match, not substring)", () => {
  // "acme-payments" is blocklisted; "acme-payments-v2" is a different, longer
  // identifier and must NOT trip the gate. This is the regression lock for the
  // rarebit-static / rarebit-static-v3 false positive caught in a live run.
  const { code, wrote } = runValidate({
    seeds: [{ angle: "A quiet week shipping acme-payments-v2 internals", grounding: [] }],
  });
  assert.equal(code, 0);
  assert.ok(wrote, "a superstring of a blocklisted term must not be rejected");
});

test("still rejects a blocklisted term as a standalone token", () => {
  const { code, wrote } = runValidate({
    seeds: [{ angle: "A quiet week for (acme-payments) and friends.", grounding: [] }],
  });
  assert.equal(code, 1);
  assert.ok(!wrote, "a standalone blocklisted token must still be rejected");
});

test("rejects an off-allowlist URL in grounding", () => {
  const { code, wrote } = runValidate({
    seeds: [{ angle: "Details elsewhere", grounding: ["https://evil.example.com/leak"] }],
  });
  assert.equal(code, 1);
  assert.ok(!wrote);
});

test("rejects a look-alike origin that only prefix-matches an allowed host", () => {
  // https://rarebit.one is allowlisted; a bare startsWith() would wrongly wave
  // through rarebit.one.evil.com — the boundary check must reject it.
  const { code, wrote } = runValidate({
    seeds: [{ angle: "See https://rarebit.one.evil.com/leak", grounding: [] }],
  });
  assert.equal(code, 1);
  assert.ok(!wrote);
});

test("accepts an allowed host with a path", () => {
  const { code, wrote } = runValidate({
    seeds: [{ angle: "Our front door", grounding: ["https://rarebit.one/connect"] }],
  });
  assert.equal(code, 0);
  assert.ok(wrote);
});

test("rejects an off-allowlist URL embedded in the angle text", () => {
  const { code, wrote } = runValidate({
    seeds: [{ angle: "See more at https://evil.example.com/leak for details", grounding: [] }],
  });
  assert.equal(code, 1);
  assert.ok(!wrote);
});

test("rejects an @handle / email in a seed", () => {
  const handle = runValidate({ seeds: [{ angle: "Thanks @teamlead for the idea", grounding: [] }] });
  assert.equal(handle.code, 1);
  assert.ok(!handle.wrote);

  const email = runValidate({ seeds: [{ angle: "Reach us at hi@example.com", grounding: [] }] });
  assert.equal(email.code, 1);
  assert.ok(!email.wrote);
});

test("empty scout day is a no-op (exit 0, nothing written)", () => {
  const { code, wrote } = runValidate({ seeds: [] });
  assert.equal(code, 0);
  assert.ok(!wrote, "must not write when there are no seeds to publish");
});

test("a day of only malformed seeds is a clean no-op (exit 0, nothing written)", () => {
  const { code, wrote } = runValidate({ seeds: [{ angle: "   ", grounding: [] }, {}] });
  assert.equal(code, 0);
  assert.ok(!wrote, "must not write when no well-formed seed survives the gate");
});
