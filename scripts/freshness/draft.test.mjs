// Tests for the drift drafter's prompt and the state it is grounded in (#610).
//
// The model once proposed copyEdit `find` strings that were not in site.ts,
// seeded by a prompt example quoting copy that had since left the file, and
// twice re-appended a note Update copied from the prompt's addendum example.
// These lock the fixes: neutral placeholder examples, the verbatim site.ts
// text in state, and the character-for-character / skip-covered-drift rules.
// validate.mjs remains the gate; none of this relaxes it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPrompts, SYSTEM_PROMPT } from "./draft.mjs";
import { extractSiteClaims } from "./gather.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_SITE = readFileSync(join(here, "fixtures", "site.ts"), "utf8");

test("the prompt carries no concrete site or note copy as an example", () => {
  assert.ok(!SYSTEM_PROMPT.includes("Humans approve the merge"), "stale site.ts example is gone");
  assert.ok(!SYSTEM_PROMPT.includes("humans clicked merge"), "verbatim addendum example is gone");
  assert.ok(!SYSTEM_PROMPT.includes("reviewed PRs auto-land"), "verbatim addendum example is gone");
});

test("the prompt requires find to be copied character for character from siteSource", () => {
  assert.match(SYSTEM_PROMPT, /CHARACTER FOR CHARACTER from siteSource\.text/);
  assert.match(SYSTEM_PROMPT, /only file you may target/);
});

test("the prompt tells the model to skip drift already covered", () => {
  assert.match(SYSTEM_PROMPT, /SKIP drift that is already handled/);
  assert.match(SYSTEM_PROMPT, /already has a "## Update" section/);
});

test("buildPrompts embeds the verbatim site.ts text from state", () => {
  const state = { workflows: [], pages: [], siteSource: { file: "src/data/site.ts", text: FIXTURE_SITE }, notes: [] };
  const { system, prompt } = buildPrompts(state);
  assert.ok(system.includes(SYSTEM_PROMPT));
  // The state is serialized as JSON, so the file text appears JSON-escaped.
  assert.ok(prompt.includes(JSON.stringify(FIXTURE_SITE)), "full site.ts text must reach the model");
});

test("extractSiteClaims keeps every literal verbatim (escapes not decoded)", () => {
  const src = [
    'export const x = [',
    '  { title: "Plain title", text: "Says \\"quoted\\" — with a dash." },',
    '  { description:',
    '    "A wrapped description.", status: "In progress", date: "2026 Q3" },',
    '];',
  ].join("\n");
  const claims = extractSiteClaims(src);
  assert.deepEqual(claims.titles, ["Plain title"]);
  assert.deepEqual(claims.benefitsText, ['Says \\"quoted\\" — with a dash.']);
  assert.deepEqual(claims.descriptions, ["A wrapped description."]);
  assert.deepEqual(claims.statuses, ["In progress"]);
  assert.deepEqual(claims.dates, ["2026 Q3"]);
  for (const list of Object.values(claims)) {
    for (const literal of list) assert.ok(src.includes(literal), `not verbatim: ${literal}`);
  }
});
