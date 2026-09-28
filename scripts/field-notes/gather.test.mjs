// Unit tests for the PURE cross-org scrub helper in gather.mjs (#54).
//
// gpt-4o kept surfacing split-out SIBLING-org names ("luminality" → org
// "luminalityai") in the drafted field note even after the draft prompt forbade
// it and the review/clear rubric blocked it — negative prompt instructions are
// unreliable. The deterministic fix is to strip those name tokens out of the
// PUBLIC text fields (PR titles, release names, seed angles) BEFORE they reach
// the LLM, so the model literally never sees them. The rubric + validate gates
// remain the backstop; this just stops the model ever emitting the tokens.
//
// These tests lock the scrub's two halves: it MUST erase every luminality token
// (including the "luminality-web/app/ui" slash shorthand) and replace it with
// the neutral placeholder, while leaving rarebit-one's OWN repo names
// (standard_id) and rarebit-one's OWN repo URLs untouched. Picked up
// automatically by the `scripts/**/*.test.mjs` test glob.

import { test } from "node:test";
import assert from "node:assert/strict";
import { scrubCrossOrg, scrubPrivateNames, slugNamesPrivate } from "./gather.mjs";

const PLACEHOLDER = "a sibling project";

test("scrubs the luminality-web/app/ui slash shorthand and luminalityai, preserving own repo name + URL", () => {
  const input =
    "Drop references to luminality-web/app/ui in favour of luminalityai; " +
    "see https://github.com/rarebit-one/.github/pull/39 — companion to standard_id work";
  const out = scrubCrossOrg(input);

  // No luminality token survives, in any casing.
  assert.ok(!/luminality/i.test(out), `expected no luminality token, got: ${out}`);
  // The placeholder is present.
  assert.ok(out.includes(PLACEHOLDER), `expected placeholder, got: ${out}`);
  // rarebit-one's OWN repo name is untouched.
  assert.ok(out.includes("standard_id"), "standard_id must be preserved");
  // rarebit-one's OWN repo URL is untouched.
  assert.ok(
    out.includes("https://github.com/rarebit-one/.github/pull/39"),
    `own-repo URL must be preserved, got: ${out}`
  );
});

test("scrubs each standalone sibling token (case-insensitive, boundary-aware)", () => {
  for (const token of ["luminality", "luminality-web", "luminality-app", "luminality-ui", "luminalityai"]) {
    const out = scrubCrossOrg(`Migrated ${token.toUpperCase()} this week.`);
    assert.ok(!/luminality/i.test(out), `expected ${token} scrubbed, got: ${out}`);
    assert.ok(out.includes(PLACEHOLDER), `expected placeholder for ${token}, got: ${out}`);
  }
});

test("collapses the slash shorthand to a SINGLE placeholder (not 'a sibling project/app/ui')", () => {
  const out = scrubCrossOrg("renamed luminality-web/app/ui");
  assert.equal(out, `renamed ${PLACEHOLDER}`);
});

test("does not fire mid-identifier or on unrelated tokens", () => {
  // Not a sibling token; an own repo name that merely shares a prefix-ish look.
  const input = "standard_id, rarebit-static-v3, illuminate the path";
  // "illuminate" contains "luminat" but not the bounded "luminality" token.
  assert.equal(scrubCrossOrg(input), input);
});

test("returns non-strings and empty strings unchanged", () => {
  assert.equal(scrubCrossOrg(""), "");
  assert.equal(scrubCrossOrg(undefined), undefined);
  assert.equal(scrubCrossOrg(null), null);
  assert.equal(scrubCrossOrg(42), 42);
});

// --- scrubPrivateNames (#595) ----------------------------------------------
// A public PR titled "re-vendor estate hooks from agent-estate" reached the
// drafter verbatim; the note repeated the private repo name and the validator
// rejected the week. The scrub must remove private names from public text,
// using the validator's identifier boundary so public look-alikes survive.

test("scrubs a private repo name out of a public PR title", () => {
  const out = scrubPrivateNames("chore: re-vendor estate hooks from agent-estate f05dc88", [
    "agent-estate",
    "rarebit-one/agent-estate",
  ]);
  assert.equal(out, "chore: re-vendor estate hooks from a private repository f05dc88");
});

test("prefers the full_name and is case-insensitive", () => {
  const out = scrubPrivateNames("Sync from Rarebit-One/Agent-Estate", ["agent-estate", "rarebit-one/agent-estate"]);
  assert.equal(out, "Sync from a private repository");
});

test("never fires inside a longer public identifier (validator boundary)", () => {
  const input = "rarebit-static-v3: tidy https://github.com/rarebit-one/rarebit-static-v3/pull/1";
  assert.equal(scrubPrivateNames(input, ["rarebit-static"]), input);
});

test("ignores terms shorter than 3 chars and uses a custom placeholder", () => {
  assert.equal(scrubPrivateNames("merged by jaryl via ci", ["ci", "jaryl"], "a maintainer"), "merged by a maintainer via ci");
});

test("non-string / empty inputs pass through", () => {
  assert.equal(scrubPrivateNames("", ["x-y-z"]), "");
  assert.equal(scrubPrivateNames(undefined, ["x-y-z"]), undefined);
  assert.equal(scrubPrivateNames("keep", undefined), "keep");
});

// --- slugNamesPrivate (#595 follow-up) --------------------------------------
test("detects a private name embedded mid-slug as hyphen segments", () => {
  assert.equal(slugNamesPrivate("updates-in-heyarr-mobile-and-dependency-management", ["heyarr-mobile"]), true);
  assert.equal(slugNamesPrivate("heyarr-mobile", ["heyarr-mobile"]), true);
  assert.equal(slugNamesPrivate("Shipping-Heyarr-Mobile-hooks", ["heyarr-mobile"]), true);
});

test("does not fire on a longer public name or a partial segment", () => {
  assert.equal(
    slugNamesPrivate("refinements-in-rarebit-static-v3-and-standard-id-releases", ["rarebit-static"], ["rarebit-static-v3", "standard_id"]),
    false
  );
  // …but the same private name standing alone in a slug is still caught.
  assert.equal(slugNamesPrivate("notes-on-rarebit-static-and-rarebit-static-v3", ["rarebit-static"], ["rarebit-static-v3"]), true);
  assert.equal(slugNamesPrivate("heyarr-mobile-app-notes", ["mobile-ap"]), false);
  assert.equal(slugNamesPrivate("any-slug", ["rarebit-one/any-slug", "an"]), false);
  assert.equal(slugNamesPrivate("", ["x-y-z"]), false);
});

test("normalizes _ and . in repo names to the slug's hyphens", () => {
  assert.equal(slugNamesPrivate("updates-from-agent-estate", ["agent_estate"]), true);
  assert.equal(slugNamesPrivate("standard-id-v0-27-0-release", ["standard_id"], ["standard_id"]), false);
});
