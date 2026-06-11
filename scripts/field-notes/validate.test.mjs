// Tests for the field-notes safety gate (validate.mjs). Because the weekly
// workflow auto-commits the note to main with NO human review between draft
// and publish, this gate is the only thing standing between an LLM draft and a
// public page — a regression here could leak a client identifier or ship a
// dead/forged link. The invariant is locked here: REJECT (exit 1, nothing
// written) on any blocklisted identifier, off-allowlist URL, email/@handle, or
// dead internal link; PASS (exit 0, markdown written) on a clean draft; and
// a thin week is a benign no-op (exit 0, nothing written).
//
// Runs the real script as a subprocess against fixtures/facts.json, so it
// exercises the actual CLI path the weekly workflow uses.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const VALIDATE = join(here, "validate.mjs");
const FACTS = join(here, "fixtures", "facts.json");

// Run validate.mjs with a draft payload (and optionally an override facts.json),
// writing into a temp dir so the real content directory is never touched.
// Fixture private totals are { runs:47, systems:5, greenPct:94 }; blocklist
// includes "acme-payments" and "octocat"; one pastNote slug is
// "this-site-was-built-by-the-farm".
function runValidate(draft, factsOverride) {
  const dir = mkdtempSync(join(tmpdir(), "fieldnotes-"));
  const draftPath = join(dir, "draft.json");
  const outPath = join(dir, "note.md");
  let factsPath = FACTS;
  writeFileSync(draftPath, JSON.stringify(draft));
  if (factsOverride) {
    factsPath = join(dir, "facts.json");
    writeFileSync(factsPath, JSON.stringify(factsOverride));
  }
  const res = spawnSync("node", [VALIDATE, factsPath, draftPath, outPath], { encoding: "utf8" });
  const wrote = existsSync(outPath);
  const markdown = wrote ? readFileSync(outPath, "utf8") : null;
  rmSync(dir, { recursive: true, force: true });
  return { code: res.status, stderr: res.stderr, wrote, markdown };
}

// A clean draft: only allowlisted URLs, generic private mention, a valid
// back-link to the fixture's past note.
const CLEAN = {
  title: "A week of merges and a release",
  description: "Two public pull requests landed and a ledger release shipped, with private systems running mostly green.",
  slug: "a-week-of-merges-and-a-release",
  body: `## Public work

We merged [field notes generator](https://github.com/rarebit-one/rarebit-static-v3/pull/21)
and [aggregate projections](https://github.com/rarebit-one/standard_ledger/pull/8), and
published [v0.4.0](https://github.com/rarebit-one/standard_ledger/releases/tag/v0.4.0).

## Behind the curtain

Across private systems, 47 runs ran 94% green this week.

See also [an earlier note](/field-notes/this-site-was-built-by-the-farm/).`,
};

test("passes a clean draft and writes the markdown", () => {
  const { code, wrote, markdown } = runValidate(CLEAN);
  assert.equal(code, 0);
  assert.ok(wrote, "expected the note markdown to be written on pass");
  // Frontmatter is present and template-derived.
  assert.match(markdown, /^---\n/);
  assert.match(markdown, /title: "A week of merges and a release"/);
  assert.match(markdown, /pubDate: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00/);
  // The body survives intact.
  assert.match(markdown, /## Public work/);
  assert.match(markdown, /47 runs ran 94% green/);
});

test("rejects a blocklisted identifier in the body", () => {
  const { code, wrote } = runValidate({
    ...CLEAN,
    body: CLEAN.body + "\n\nBig week for acme-payments.",
  });
  assert.equal(code, 1);
  assert.ok(!wrote, "must not write when a blocklisted name leaks");
});

test("passes a superstring of a blocklisted term (boundary match, not substring)", () => {
  // "acme-payments" is blocklisted; "acme-payments-v2" is a different, longer
  // identifier and must NOT trip the gate. Regression lock for the
  // rarebit-static / rarebit-static-v3 false positive caught in a live run.
  const { code, wrote } = runValidate({
    ...CLEAN,
    body: CLEAN.body + "\n\nA quiet week shipping acme-payments-v2 internals.",
  });
  assert.equal(code, 0);
  assert.ok(wrote, "a superstring of a blocklisted term must not be rejected");
});

test("still rejects a blocklisted term as a standalone token", () => {
  const { code, wrote } = runValidate({
    ...CLEAN,
    body: CLEAN.body + "\n\nBig week for (acme-payments) and friends.",
  });
  assert.equal(code, 1);
  assert.ok(!wrote, "a standalone blocklisted token must still be rejected");
});

test("rejects an @handle that follows punctuation", () => {
  // The tightened regex catches ",@user" / "/@user" the old [\s(] class missed.
  const { code, wrote } = runValidate({
    ...CLEAN,
    body: CLEAN.body + "\n\nThanks,@someone for the help.",
  });
  assert.equal(code, 1);
  assert.ok(!wrote, "an @handle after punctuation must be rejected");
});

test("rejects a look-alike URL host (boundary-anchored allowlist)", () => {
  // https://rarebit.one is allowlisted; a bare startsWith() would wrongly wave
  // through rarebit.one.evil.com — the boundary check must reject it.
  const { code, wrote } = runValidate({
    ...CLEAN,
    body: CLEAN.body + "\n\nMore at https://rarebit.one.evil.com/x for details.",
  });
  assert.equal(code, 1);
  assert.ok(!wrote, "a look-alike URL host must be rejected");
});

test("still passes a legitimately allowed URL (rarebit.one with a path)", () => {
  const { code, wrote } = runValidate({
    ...CLEAN,
    body: CLEAN.body + "\n\nOur front door: https://rarebit.one/connect.",
  });
  assert.equal(code, 0);
  assert.ok(wrote, "an allowlisted URL with a path must still pass");
});

test("rejects an off-allowlist URL", () => {
  const { code, wrote } = runValidate({
    ...CLEAN,
    body: CLEAN.body + "\n\nMore at https://evil.example.com/leak.",
  });
  assert.equal(code, 1);
  assert.ok(!wrote);
});

test("rejects an @handle / email", () => {
  const handle = runValidate({ ...CLEAN, body: CLEAN.body + "\n\nThanks @teamlead." });
  assert.equal(handle.code, 1);
  assert.ok(!handle.wrote);

  const email = runValidate({ ...CLEAN, body: CLEAN.body + "\n\nReach us at hi@example.com." });
  assert.equal(email.code, 1);
  assert.ok(!email.wrote);
});

test("rejects a dead internal link", () => {
  const { code, wrote } = runValidate({
    ...CLEAN,
    body: CLEAN.body + "\n\nSee [missing](/field-notes/does-not-exist/).",
  });
  assert.equal(code, 1);
  assert.ok(!wrote);
});

test("thin week is a no-op, not a failure (exit 0, nothing written)", () => {
  const thin = {
    window: { from: "2026-06-01", to: "2026-06-07" },
    public: { prs: [], releases: [], repos: ["rarebit-static-v3"] },
    private: { totals: { runs: 0, systems: 0, greenPct: 100 }, categories: [], events: [], blocklist: [] },
    pastNotes: [],
  };
  const { code, wrote } = runValidate(CLEAN, thin);
  assert.equal(code, 0);
  assert.ok(!wrote, "must not write a note for a thin week");
});
