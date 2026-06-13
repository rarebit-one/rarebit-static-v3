// Unit tests for the PURE deterministic seed-usage resolver (#54).
//
// Seed closing used to depend solely on the draft's self-reported
// `usedSeedIssues`, but gpt-4o returns an empty array even when it drew on a
// seed — so `field-note-seed` issues never closed and the open queue grew
// unbounded. resolveUsedSeeds instead closes a seed iff one of its grounding
// URLs appears as a link in the published note body; the model's self-report is
// a filtered secondary signal that can only ever close seeds it was given.
//
// These tests lock: grounding-URL presence closes a seed; absence does not;
// exact-URL matching (no ".../pull/73" ⊂ ".../pull/733" false positive);
// trailing-slash / markdown-paren normalization; the model claim is honored
// only for real input seeds; and empty/garbage inputs are safe. Picked up
// automatically by the `scripts/**/*.test.mjs` test glob.

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveUsedSeeds } from "./seeds.mjs";

const seed = (issue, ...grounding) => ({ issue, angle: `angle ${issue}`, grounding });

test("closes a seed whose grounding URL is linked in the note body", () => {
  const seeds = [
    seed(75, "https://github.com/rarebit-one/rarebit-static-v3/pull/73"),
    seed(77, "https://github.com/rarebit-one/rarebit-static-v3/pull/59"),
  ];
  const body =
    "## Update\nSee the [refactor](https://github.com/rarebit-one/rarebit-static-v3/pull/73) for details.";
  assert.deepEqual(resolveUsedSeeds({ seeds, body }), [75]);
});

test("does not close a seed whose grounding URL is absent from the note", () => {
  const seeds = [seed(77, "https://github.com/rarebit-one/standard_id/pull/238")];
  const body = "## Note\nNothing about that PR this week.";
  assert.deepEqual(resolveUsedSeeds({ seeds, body }), []);
});

test("matches whole URLs only — pull/73 does not match pull/733", () => {
  const seeds = [seed(75, "https://github.com/rarebit-one/rarebit-static-v3/pull/73")];
  const body = "Linked [PR](https://github.com/rarebit-one/rarebit-static-v3/pull/733).";
  assert.deepEqual(resolveUsedSeeds({ seeds, body }), []);
});

test("normalizes trailing slash and markdown-paren punctuation", () => {
  const seeds = [
    seed(75, "https://github.com/rarebit-one/standard_id/releases/tag/v0.23.0/"),
  ];
  // Body link has no trailing slash and is wrapped in markdown parens + a period.
  const body =
    "Released [v0.23.0](https://github.com/rarebit-one/standard_id/releases/tag/v0.23.0).";
  assert.deepEqual(resolveUsedSeeds({ seeds, body }), [75]);
});

test("unions the model's self-report, but only for seeds it was actually given", () => {
  const seeds = [seed(80, "https://example.com/unlinked"), seed(81, "https://example.com/also-unlinked")];
  const body = "No grounding URLs appear here.";
  // 80 is a real input seed → honored; 999 was never an input seed → ignored.
  assert.deepEqual(resolveUsedSeeds({ seeds, body, modelClaimed: [80, 999] }), [80]);
});

test("deterministic match and model claim combine, de-duped and sorted", () => {
  const seeds = [
    seed(75, "https://github.com/rarebit-one/rarebit-static-v3/pull/73"),
    seed(77, "https://example.com/none"),
  ];
  const body = "Linked https://github.com/rarebit-one/rarebit-static-v3/pull/73 here.";
  assert.deepEqual(resolveUsedSeeds({ seeds, body, modelClaimed: [77, 75] }), [75, 77]);
});

test("ignores seeds with invalid issue numbers and bad grounding", () => {
  const seeds = [
    { issue: 0, grounding: ["https://example.com/x"] },
    { issue: -3, grounding: ["https://example.com/y"] },
    { issue: 90, grounding: "not-an-array" },
    { issue: 91, grounding: [123, null] },
  ];
  const body = "https://example.com/x https://example.com/y";
  assert.deepEqual(resolveUsedSeeds({ seeds, body }), []);
});

test("empty / missing inputs are safe", () => {
  assert.deepEqual(resolveUsedSeeds({}), []);
  assert.deepEqual(resolveUsedSeeds({ seeds: [], body: "" }), []);
  assert.deepEqual(resolveUsedSeeds({ seeds: null, body: null, modelClaimed: null }), []);
});
