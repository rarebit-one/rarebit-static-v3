// Tests for the notebook safety gate (validate.mjs). Because the daily workflow
// writes the merged notebook straight back to the (private) bucket with NO
// human review between curate and publish, this gate is the only thing standing
// between an LLM's idea-seeds and the notebook the weekly field note later
// mines. A regression here could persist a client identifier or an off-facts
// link that then surfaces in a published note. The invariant is locked here:
// REJECT (exit 1, nothing written) on any blocklisted identifier, email/@handle,
// or off-allowlist URL; PASS (exit 0, notebook written) on clean seeds — and on
// pass, MERGE with the existing notebook and DROP seeds older than 14 days.
//
// Runs the real script as a subprocess against fixtures/notebook-raw.json, so it
// exercises the actual CLI path the daily workflow uses.

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

// Run validate.mjs with curated seeds and (optionally) an existing notebook,
// writing into a temp dir so nothing real is touched. The fixture's blocklist
// includes "acme-payments" and "octocat"; its public URLs cover PR #40 on
// rarebit-static-v3, a standard_ledger release, and a standard_id commit.
function runValidate(seeds, existingNotebook) {
  const dir = mkdtempSync(join(tmpdir(), "notebook-"));
  const seedsPath = join(dir, "seeds.json");
  const outPath = join(dir, "notebook.json");
  writeFileSync(seedsPath, JSON.stringify(seeds));
  let existingPath = join(dir, "no-existing.json"); // a path that does not exist
  if (existingNotebook) {
    existingPath = join(dir, "existing.json");
    writeFileSync(existingPath, JSON.stringify(existingNotebook));
  }
  const res = spawnSync("node", [VALIDATE, RAW, seedsPath, existingPath, outPath], { encoding: "utf8" });
  const wrote = existsSync(outPath);
  const notebook = wrote ? JSON.parse(readFileSync(outPath, "utf8")) : null;
  rmSync(dir, { recursive: true, force: true });
  return { code: res.status, stderr: res.stderr, wrote, notebook };
}

const sgtIso = (msAgo) => {
  const d = new Date(Date.now() - msAgo + 8 * 3600_000);
  return `${d.toISOString().slice(0, 19)}+08:00`;
};
const DAY = 24 * 3600_000;

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

test("passes clean seeds and writes the notebook", () => {
  const { code, wrote, notebook } = runValidate(CLEAN);
  assert.equal(code, 0);
  assert.ok(wrote, "expected the notebook to be written on pass");
  assert.equal(notebook.seeds.length, 3);
  // Every persisted seed carries a SGT timestamp + the angle survives intact.
  for (const seed of notebook.seeds) {
    assert.match(seed.at, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00/);
    assert.equal(typeof seed.angle, "string");
  }
});

test("merges new seeds with the existing notebook and drops seeds older than 14 days", () => {
  const existing = {
    generated: "2026-05-01T00:00:00.000Z",
    seeds: [
      { at: sgtIso(30 * DAY), angle: "STALE — should be dropped (30 days old)", grounding: [] },
      { at: sgtIso(3 * DAY), angle: "FRESH — should survive (3 days old)", grounding: ["https://rarebit.one"] },
    ],
  };
  const { code, wrote, notebook } = runValidate(CLEAN, existing);
  assert.equal(code, 0);
  assert.ok(wrote);
  const angles = notebook.seeds.map((s) => s.angle);
  // 3 fresh from this run + the 1 surviving existing seed = 4; stale dropped.
  assert.equal(notebook.seeds.length, 4);
  assert.ok(angles.includes("FRESH — should survive (3 days old)"));
  assert.ok(!angles.some((a) => a.startsWith("STALE")), "stale seed must be dropped");
});

test("rejects a blocklisted identifier in a seed angle", () => {
  const { code, wrote } = runValidate({
    seeds: [{ angle: "A big week for acme-payments and their pipeline", grounding: [] }],
  });
  assert.equal(code, 1);
  assert.ok(!wrote, "must not write when a blocklisted name leaks");
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

test("empty scout day with no existing notebook is a no-op (exit 0, nothing written)", () => {
  const { code, wrote } = runValidate({ seeds: [] });
  assert.equal(code, 0);
  assert.ok(!wrote, "must not write a notebook when there is nothing to persist");
});

test("empty scout day WITH an existing notebook re-persists the still-fresh existing seeds", () => {
  const existing = {
    generated: "2026-06-09T00:00:00.000Z",
    seeds: [{ at: sgtIso(2 * DAY), angle: "Carried over from yesterday", grounding: [] }],
  };
  const { code, wrote, notebook } = runValidate({ seeds: [] }, existing);
  assert.equal(code, 0);
  assert.ok(wrote, "should re-write the notebook to apply retention even with no new seeds");
  assert.equal(notebook.seeds.length, 1);
  assert.equal(notebook.seeds[0].angle, "Carried over from yesterday");
});
