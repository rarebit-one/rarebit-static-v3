// Regression tests for the notebook SENSOR's retrofit onto scripts/lib/issues.mjs
// (issue #56). publish.mjs shells out to `gh` for IO, so these tests do NOT run
// the script end-to-end; instead they lock the two things the retrofit MUST
// preserve so the LIVE seed loop (issues #46–#50, #60–#68) keeps working:
//
//   1. MARKER COMPATIBILITY — the marker the publisher now emits via
//      buildMarker("seed", { angle, grounding }) is BYTE-IDENTICAL to the marker
//      the old inline `<!-- seed:${JSON.stringify({ angle, grounding })} -->`
//      produced, AND parseMarker recovers a seed written by EITHER path. So an
//      already-open seed issue still round-trips after the retrofit.
//
//   2. DEDUP RULE — the by-PRIMARY-grounding-URL dedup (check the primary URL,
//      remember ALL grounding of anything filed) still skips a candidate whose
//      primary URL is already represented by an open seed, and dedups within the
//      same run. This mirrors the inline `existingUrls` loop publish.mjs uses.
//
// Picked up automatically by the `scripts/**/*.test.mjs` test glob.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMarker, parseMarker } from "../lib/issues.mjs";

// The exact inline marker the PRE-retrofit publish.mjs wrote (from git history):
//   const marker = JSON.stringify({ angle, grounding });
//   `<!-- seed:${marker} -->`
function legacyMarker(angle, grounding) {
  return `<!-- seed:${JSON.stringify({ angle, grounding })} -->`;
}

test("publish marker is byte-identical to the legacy inline `seed:` marker", () => {
  const angle = "small teams shipping impossible things";
  const grounding = ["https://github.com/rarebit-one/x/pull/1"];
  // emitIssue builds the marker as buildMarker(type, data); type = "seed".
  assert.equal(buildMarker("seed", { angle, grounding }), legacyMarker(angle, grounding));
});

test("parseMarker recovers a seed written by the legacy inline marker", () => {
  // Reconstruct a body shaped like an OPEN seed issue filed before the retrofit
  // (#46–#50 era): prose, grounding list, footer, then the trailing marker.
  const angle = "the farm's CI got quietly faster this week";
  const grounding = [
    "https://github.com/rarebit-one/rarebit-static-v3/pull/55",
    "https://github.com/rarebit-one/rarebit-static-v3/pull/56",
  ];
  const legacyBody = [
    angle,
    "",
    "**Grounded in:**",
    "",
    grounding.map((u) => `- ${u}`).join("\n"),
    "",
    "_Auto-scouted by the farm's notebook on 2026-05-01._",
    "",
    legacyMarker(angle, grounding),
  ].join("\n");

  const parsed = parseMarker(legacyBody, "seed");
  assert.ok(parsed, "expected to recover the legacy seed marker");
  assert.equal(parsed.type, "seed");
  assert.deepEqual(parsed.data, { angle, grounding });
});

test("parseMarker recovers a seed written by the RETROFITTED emit path", () => {
  // The retrofitted publish.mjs body: prose+footer, then emitIssue appends
  // `\n\n` + buildMarker("seed", data). The marker still parses to the same seed.
  const angle = "an addendum landed on a drifted note";
  const grounding = ["https://rarebit.one/field-notes/some-note/"];
  const proseBody = [
    angle,
    "",
    "**Grounded in:**",
    "",
    `- ${grounding[0]}`,
    "",
    "_Auto-scouted by the farm's notebook on 2026-05-02._",
  ].join("\n");
  const fullBody = `${proseBody}\n\n${buildMarker("seed", { angle, grounding })}`;

  const parsed = parseMarker(fullBody, "seed");
  assert.ok(parsed);
  assert.deepEqual(parsed.data, { angle, grounding });
});

// --- The dedup rule, modelled exactly as publish.mjs runs it ----------------
// publish.mjs keeps a running `existingUrls` set: seeded from every open issue's
// grounding (recovered via parseMarker), then a candidate is skipped iff its
// PRIMARY url is in the set, and on accept ALL the candidate's grounding joins
// the set. This helper replays that loop on plain data so the test pins the rule.
function dedupByPrimary(openGroundings, candidates) {
  const existingUrls = new Set(openGroundings.flat());
  const created = [];
  const skipped = [];
  for (const grounding of candidates) {
    const primary = grounding[0];
    if (primary && existingUrls.has(primary)) {
      skipped.push(grounding);
      continue;
    }
    created.push(grounding);
    for (const u of grounding) existingUrls.add(u);
  }
  return { created, skipped };
}

test("dedup skips a candidate whose primary URL is on an open seed", () => {
  const open = [["https://example.com/a", "https://example.com/a2"]];
  const candidates = [
    ["https://example.com/a"], // dup of an open primary → skipped
    ["https://example.com/b"], // new → created
  ];
  const { created, skipped } = dedupByPrimary(open, candidates);
  assert.deepEqual(created, [["https://example.com/b"]]);
  assert.deepEqual(skipped, [["https://example.com/a"]]);
});

test("dedup catches a candidate primary that is a NON-primary of an open seed", () => {
  // Open seed grounding = [a2 (primary), a]. A new candidate whose primary is `a`
  // collides because publish remembers ALL grounding URLs of open seeds.
  const open = [["https://example.com/a2", "https://example.com/a"]];
  const { created, skipped } = dedupByPrimary(open, [["https://example.com/a"]]);
  assert.deepEqual(created, []);
  assert.equal(skipped.length, 1);
});

test("dedup is intra-run: a later candidate dups against an earlier accepted one", () => {
  const { created } = dedupByPrimary(
    [],
    [
      ["https://example.com/x", "https://example.com/x2"],
      ["https://example.com/x"], // same primary as the first accepted → skipped
      ["https://example.com/y"],
    ]
  );
  assert.deepEqual(created, [
    ["https://example.com/x", "https://example.com/x2"],
    ["https://example.com/y"],
  ]);
});

test("a candidate with NO grounding is never treated as a dup", () => {
  // primary is undefined → the `primary && …` guard short-circuits, so it's filed.
  const { created } = dedupByPrimary([["https://example.com/a"]], [[]]);
  assert.deepEqual(created, [[]]);
});

test("a seed with no marker falls back to scraping URLs from the body text", () => {
  // The legacy fallback when parseMarker returns null: scrape https URLs out of
  // the prose. We assert parseMarker returns null (no marker) so the fallback fires.
  const bodyNoMarker = "An open seed with no marker, grounded in https://example.com/z.";
  assert.equal(parseMarker(bodyNoMarker, "seed"), null);
  const scraped = (bodyNoMarker.match(/https?:\/\/[^\s)\]<>"']+/gi) ?? []).map((u) =>
    u.replace(/[.,;:]+$/, "")
  );
  assert.deepEqual(scraped, ["https://example.com/z"]);
});
