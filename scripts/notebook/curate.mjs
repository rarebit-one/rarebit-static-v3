// Notebook pipeline · step 2 of 3 — CURATE (the only LLM call).
//
// The middle of the "digest sandwich". Input is the SANITIZED raw from
// gather.mjs — public items (already public, named + linkable) plus the
// private side as anonymized category counts only. The `blocklist` is STRIPPED
// before the prompt is built (the model has no reason to see private repo
// names, even to avoid them). The model phrases idea-seeds; it does not redact.
// The validator (step 3) is the gate.
//
// One Anthropic API call per run (claude-haiku-4-5 — pennies/day; this runs
// daily). Missing ANTHROPIC_API_KEY → exit 0 with a notice. Missing input
// (gather skipped) → exit 0. Both keep the workflow green until secrets are
// wired up.
//
// A seed is a one-line idea/prompt for a FUTURE field note, grounded ONLY in
// the provided public facts; private work may be referenced only as a generic
// anonymized observation. Output: { seeds: [ { angle, grounding:[url,...] } ] }.
//
// Input:  argv[2] (default ./notebook-raw.json)
// Output: argv[3] (default ./seeds.json)

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { voiceHeader } from "../lib/voice.mjs";

const IN = process.argv[2] ?? "notebook-raw.json";
const OUT = process.argv[3] ?? "seeds.json";
const KEY = process.env.ANTHROPIC_API_KEY;

if (!KEY) {
  console.log("curate: ANTHROPIC_API_KEY not set — skipping (graceful no-op).");
  process.exit(0);
}
if (!existsSync(IN)) {
  // gather.mjs no-op'd (no token) — nothing to curate. Stay green.
  console.log(`curate: ${IN} absent (gather skipped) — skipping (graceful no-op).`);
  process.exit(0);
}

const raw = JSON.parse(readFileSync(IN, "utf8"));

// Strip the blocklist before it reaches the prompt — the model has no reason
// to see private repo names or member logins, even to avoid them.
const { blocklist, ...forModel } = raw;

const system = `${voiceHeader()}

You are the farm's notebook scout. Your job is to skim a day of activity and jot down a few "idea-seeds" — short, concrete angles a FUTURE weekly field note might develop. You are NOT writing the note; you are leaving breadcrumbs.

PUBLIC work may be named and linked, using ONLY the repo names, titles, and URLs given in the facts. Never construct or guess any other URL.

PRIVATE/client work is provided ONLY as anonymized category counts. You may reference it only as a generic, anonymized observation (e.g. "a quiet week of scheduled data pipelines") and NEVER name or describe a client, product, person, or private repository, even in passing. Never invent a number that isn't in the facts.`;

const prompt = `Here is the recent activity (window, public items, anonymized private aggregate):

${JSON.stringify(forModel, null, 2)}

Produce STRICT JSON only — no prose, no markdown code fences — with exactly this shape:

{
  "seeds": [
    { "angle": "<one concrete idea/prompt for a future field note>", "grounding": ["<public url drawn from the facts>", "..."] }
  ]
}

Rules:
- 2 to 6 seeds. Fewer is fine; never pad.
- Each "angle" is a short, concrete one-liner grounded ONLY in the provided public facts (or a generic anonymized observation about private activity).
- Each "grounding" entry MUST be a public URL copied verbatim from the facts (a PR/release/commit URL, or https://rarebit.one). A purely generic private observation may use an empty grounding array [].
- NEVER name a client, product, person, or private repository. NEVER include an email, @handle, or any URL not present in the facts.`;

const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: prompt }],
  }),
});

if (!response.ok) {
  console.error(`curate: Anthropic API ${response.status} — ${await response.text()}`);
  process.exit(1);
}

const data = await response.json();
const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");

// The model is asked for bare JSON; tolerate accidental fencing.
const jsonStr = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

let curated;
try {
  curated = JSON.parse(jsonStr);
} catch {
  console.error(`curate: model did not return valid JSON:\n${text.slice(0, 500)}`);
  process.exit(1);
}

if (!Array.isArray(curated.seeds)) {
  console.error("curate: output missing seeds array");
  process.exit(1);
}

writeFileSync(OUT, JSON.stringify(curated, null, 2));
console.log(`curate: ${curated.seeds.length} idea-seeds → ${OUT}`);
