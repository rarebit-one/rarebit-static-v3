// Tests for the deterministic changelog-restore helper in draft.mjs.
//
// Context: a live voice-actor run failed because gpt-4o rewrote a line INSIDE
// the protected changelog block, which validate.mjs (check 6) rejects — it
// requires the proposed changelog block to equal the current one byte-for-byte
// (the pipeline, not the drafter, prepends the new entry). Rather than weaken
// that gate, draft.mjs now deterministically resets the proposal's changelog
// block to the current file's before writing proposal.json. This locks that
// behaviour: a changelog edit is discarded, while the body nudge survives.

import { test } from "node:test";
import assert from "node:assert/strict";
import { restoreChangelogBlock } from "./draft.mjs";

const C_START = "<!-- VOICE-CHANGELOG:START -->";
const C_END = "<!-- VOICE-CHANGELOG:END -->";

// A minimal VOICE.md-shaped fixture with a body line we can nudge and a
// changelog block the drafter must not touch.
const CURRENT = [
  "# VOICE.md",
  "",
  "Body line that may be tightened by a nudge.",
  "",
  "## Changelog",
  "",
  C_START,
  "- 2026-06-11 — Voice codified. The original entry.",
  C_END,
  "",
].join("\n");

test("resets a drafter-edited changelog block to the current one, byte-for-byte", () => {
  // The model nudged the body (allowed) AND rewrote the changelog (not allowed).
  const proposed = CURRENT
    .replace("may be tightened by a nudge", "is tightened by this week's nudge")
    .replace("Voice codified. The original entry.", "Voice REWRITTEN by the drafter.");
  assert.notEqual(proposed, CURRENT, "fixture must actually differ");

  const out = restoreChangelogBlock(proposed, CURRENT);

  // The body nudge is PRESERVED.
  assert.ok(
    out.includes("is tightened by this week's nudge"),
    "the body edit must survive the restore"
  );
  // The changelog meddling is DISCARDED — block matches current byte-for-byte.
  assert.ok(
    out.includes("- 2026-06-11 — Voice codified. The original entry."),
    "the original changelog entry must be restored"
  );
  assert.ok(
    !out.includes("Voice REWRITTEN by the drafter."),
    "the drafter's changelog edit must be gone"
  );

  // And the restored block is exactly the current block (markers + inner).
  const cur = CURRENT.slice(CURRENT.indexOf(C_START), CURRENT.indexOf(C_END) + C_END.length);
  const got = out.slice(out.indexOf(C_START), out.indexOf(C_END) + C_END.length);
  assert.equal(got, cur, "the proposal's changelog block must equal current's exactly");
});

test("leaves an untouched changelog block unchanged (no spurious diff)", () => {
  const proposed = CURRENT.replace(
    "may be tightened by a nudge",
    "is tightened by this week's nudge"
  );
  const out = restoreChangelogBlock(proposed, CURRENT);
  assert.equal(out, proposed, "a proposal that left the changelog alone is returned as-is");
});

test("returns the proposal unchanged when a marker block is malformed", () => {
  const noMarkers = "# VOICE.md\n\nSome body without a changelog block.\n";
  assert.equal(restoreChangelogBlock(noMarkers, CURRENT), noMarkers);
  assert.equal(restoreChangelogBlock(CURRENT, noMarkers), CURRENT);
});
