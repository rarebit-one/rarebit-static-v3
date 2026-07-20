// Tests for the voice-evolution bounded-diff gate (validate.mjs). This is the
// component that decides whether the farm may self-edit its own canonical voice,
// auto-landed via PR with no human in the loop before the diff is opened — so a
// regression here could let the voice drift, drop an invariant, or smuggle a
// source into the header. The contract is locked here: REJECT (exit 1, nothing
// written) an oversized rewrite, a dropped invariant, a gimmicky phrase, or a
// URL in the header; ACCEPT (exit 0, new VOICE.md written) a small bounded nudge
// that adds exactly one dated changelog entry.
//
// Runs the real script as a subprocess against fixtures/VOICE.md, so it
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
const VOICE = join(here, "fixtures", "VOICE.md");
const CURRENT = readFileSync(VOICE, "utf8");

// Today's date in SGT — must match how validate.mjs derives it.
const TODAY = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

const C_START = "<!-- VOICE-CHANGELOG:START -->";
const H_START = "<!-- VOICE-HEADER:START -->";
const H_END = "<!-- VOICE-HEADER:END -->";

// Run validate.mjs with a proposal; returns exit code + whether/what it wrote.
function runValidate(proposal) {
  const dir = mkdtempSync(join(tmpdir(), "voice-"));
  const proposalPath = join(dir, "proposal.json");
  const outPath = join(dir, "VOICE.out.md");
  writeFileSync(proposalPath, JSON.stringify(proposal));
  const res = spawnSync("node", [VALIDATE, VOICE, proposalPath, outPath], { encoding: "utf8" });
  const wrote = existsSync(outPath);
  const out = wrote ? readFileSync(outPath, "utf8") : null;
  rmSync(dir, { recursive: true, force: true });
  return { code: res.status, stderr: res.stderr, wrote, out };
}

const CHANGELOG_ENTRY = `${TODAY} — Tightened one lexicon entry to track this week's lab releases.`;

// A small, bounded nudge: swap a single avoid-word in the Lexicon. Leaves the
// header and changelog block byte-for-byte intact (the drafter never edits the
// changelog; the gate prepends).
function smallNudge() {
  const voiceMd = CURRENT.replace("disrupt; solution (as filler)", "disrupt; orchestrate (as filler)");
  assert.notEqual(voiceMd, CURRENT, "fixture must contain the phrase the nudge edits");
  return { voiceMd, changelog: CHANGELOG_ENTRY };
}

test("accepts a small bounded nudge and prepends one dated changelog entry", () => {
  const { code, wrote, out } = runValidate(smallNudge());
  assert.equal(code, 0);
  assert.ok(wrote, "expected the evolved VOICE.md to be written on pass");
  // The new entry is now the first changelog line (newest-first), and the prior
  // entry is preserved below it.
  const block = out.slice(out.indexOf(C_START));
  const dated = block.match(/^-\s*\d{4}-\d{2}-\d{2}\b/gm) ?? [];
  assert.equal(dated.length, 2, "changelog should now hold exactly two dated entries");
  // The new entry's text must sit ABOVE the original "Voice codified." entry
  // (newest-first). Using the entry text, not the date, keeps this robust even
  // when TODAY coincides with the seed entry's date.
  assert.ok(
    block.indexOf("Tightened one lexicon entry") < block.indexOf("Voice codified."),
    "new entry must be newest-first"
  );
  assert.ok(out.includes("orchestrate (as filler)"), "the bounded edit should be present");
});

test("rejects a changelog-only diff (no-op false evolution)", () => {
  // The proposal leaves VOICE.md byte-for-byte unchanged (body AND changelog
  // block) but supplies a fresh dated entry. The bounded diff is happy — zero
  // lines changed outside the changelog — but the canonical voice never moved,
  // so the changelog would record an evolution that didn't happen. This is the
  // PR #262 shape; the no-op guard must reject it.
  const { code, wrote, stderr } = runValidate({ voiceMd: CURRENT, changelog: CHANGELOG_ENTRY });
  assert.equal(code, 1);
  assert.ok(!wrote, "must not write on a changelog-only no-op");
  assert.match(stderr, /no-op evolution/);
});

test("rejects a whitespace-only non-changelog diff (no-op false evolution)", () => {
  // The only change to the body is added/altered whitespace (trailing spaces +
  // a blank line). After normalisation the voice is identical, so this is still
  // a false evolution and must be rejected — not counted as a real nudge.
  const voiceMd = CURRENT.replace(
    "Confidence comes from receipts,\nnot adjectives.",
    "Confidence comes from receipts,   \n\nnot adjectives.",
  );
  assert.notEqual(voiceMd, CURRENT, "fixture must contain the phrase the whitespace edit targets");
  const { code, wrote, stderr } = runValidate({ voiceMd, changelog: CHANGELOG_ENTRY });
  assert.equal(code, 1);
  assert.ok(!wrote, "must not write on a whitespace-only no-op");
  assert.match(stderr, /no-op evolution/);
});

test("accepts a changelog entry that IS accompanied by a real body edit", () => {
  // The complement of the two no-op cases: a genuine one-line nudge to the body
  // alongside the changelog entry passes the no-op guard (and the rest of the
  // gate), and the evolved VOICE.md is written.
  const { code, wrote, stderr } = runValidate(smallNudge());
  assert.equal(code, 0, `expected pass; stderr: ${stderr}`);
  assert.ok(wrote, "a real body edit + changelog entry must be accepted");
});

test("rejects an oversized rewrite (bounded-diff exceeded)", () => {
  // Replace the whole body between header end and the Lexicon with many new
  // lines — far more than the threshold — while keeping markers intact.
  const filler = Array.from({ length: 40 }, (_, i) => `Rewritten line ${i}.`).join("\n");
  const voiceMd = CURRENT.replace(H_END, `${H_END}\n\n${filler}`);
  const { code, wrote, stderr } = runValidate({ voiceMd, changelog: CHANGELOG_ENTRY });
  assert.equal(code, 1);
  assert.ok(!wrote, "must not write on an oversized rewrite");
  assert.match(stderr, /bounded-diff exceeded/);
});

test("rejects removal of a hard invariant from the VOICE-HEADER", () => {
  // Drop the neutral-spelling line from the header.
  const voiceMd = CURRENT.replace(/^- British\/neutral spelling\.\n/m, "");
  assert.notEqual(voiceMd, CURRENT, "fixture must contain the neutral-spelling line");
  const { code, wrote, stderr } = runValidate({ voiceMd, changelog: CHANGELOG_ENTRY });
  assert.equal(code, 1);
  assert.ok(!wrote);
  assert.match(stderr, /neutral-spelling invariant/);
});

test("rejects a gimmicky self-aware phrase", () => {
  const voiceMd = CURRENT.replace("the build log is public", "beep boop, the build log is public");
  const { code, wrote, stderr } = runValidate({ voiceMd, changelog: CHANGELOG_ENTRY });
  assert.equal(code, 1);
  assert.ok(!wrote);
  assert.match(stderr, /gimmicky/);
});

test("rejects a URL inside the VOICE-HEADER", () => {
  // Inject a URL between the header markers.
  const voiceMd = CURRENT.replace(
    "Hard rules, always:",
    "See https://openai.com/news for context.\n\nHard rules, always:"
  );
  const { code, wrote, stderr } = runValidate({ voiceMd, changelog: CHANGELOG_ENTRY });
  assert.equal(code, 1);
  assert.ok(!wrote);
  assert.match(stderr, /VOICE-HEADER contains a URL/);
});

test("rejects a proposal missing the VOICE-HEADER markers (structure)", () => {
  const voiceMd = CURRENT.replace(H_START, "").replace(H_END, "");
  const { code, wrote, stderr } = runValidate({ voiceMd, changelog: CHANGELOG_ENTRY });
  assert.equal(code, 1);
  assert.ok(!wrote);
  assert.match(stderr, /VOICE-HEADER markers/);
});

test("rejects a changelog entry not dated today", () => {
  const { code, wrote, stderr } = runValidate({
    voiceMd: smallNudge().voiceMd,
    changelog: "2020-01-01 — stale-dated entry",
  });
  assert.equal(code, 1);
  assert.ok(!wrote);
  assert.match(stderr, /start with today's date/);
});

test("rejects the drafter editing the existing changelog block", () => {
  // The drafter is supposed to leave the changelog untouched; the gate prepends.
  const voiceMd = smallNudge().voiceMd.replace("Voice codified.", "Voice REWRITTEN.");
  const { code, wrote, stderr } = runValidate({ voiceMd, changelog: CHANGELOG_ENTRY });
  assert.equal(code, 1);
  assert.ok(!wrote);
  assert.match(stderr, /changelog block was edited/);
});
