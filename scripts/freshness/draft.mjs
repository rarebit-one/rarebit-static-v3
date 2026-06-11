// Site-freshness pipeline · step 2 of 3 — DRAFT (the only LLM call).
//
// The middle of the sandwich. Input is state.json from gather.mjs. The model
// acts as a STEWARD: it proposes a small, bounded patch that keeps the public
// site honest as the farm's capabilities change, and NOTHING ELSE. It never
// edits a field note's original prose — for a drifted note it proposes an
// APPENDED addendum that acknowledges the change while the original stands.
//
// Output is a patch proposal, not the applied edit. The validator (step 3) is
// the gate: it re-derives every change deterministically, enforces the
// byte-for-byte preservation of original note prose, and only then writes.
//
// One Anthropic API call per run (claude-opus-4-8). Missing ANTHROPIC_API_KEY
// → exit 0 with a notice. Missing/empty state.json → exit 0. Both keep the
// workflow green until secrets are wired up.
//
// Input:  argv[2] (default ./state.json)
// Output: argv[3] (default ./patch.json)
//   { copyEdits: [{ file, find, replace, why }], addenda: [{ slug, addendum, why }] }

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { voiceHeader } from "../lib/voice.mjs";

const IN = process.argv[2] ?? "state.json";
const OUT = process.argv[3] ?? "patch.json";
const KEY = process.env.ANTHROPIC_API_KEY;

function noop(reason) {
  console.log(`draft: ${reason} — skipping (graceful no-op).`);
  process.exit(0);
}

if (!KEY) noop("ANTHROPIC_API_KEY not set");
if (!existsSync(IN)) noop(`${IN} absent (gather skipped)`);

const state = JSON.parse(readFileSync(IN, "utf8"));
if (!state || (!Array.isArray(state.notes) && !state.siteClaims)) {
  noop(`${IN} has no usable state`);
}

const system = `${voiceHeader()}

You are the STEWARD of rarebit.one's public copy. Once a week you review the site against the farm's actual current capabilities and propose a SMALL, BOUNDED patch that keeps it honest. You are conservative: if nothing is genuinely stale, you propose nothing.

You are given state.json: the list of CI workflow filenames (capability signals — e.g. an "auto-land.yml" present means gated auto-land already exists, so copy that says a human must click merge is becoming historical), the page inventory, the checkable static claims from src/data/site.ts, and every field note (slug, frontmatter, FULL body).

You may propose exactly two kinds of change:

1. copyEdits — correct a STALE static claim in src/data/site.ts or a page. "find" MUST be an EXACT substring that currently appears in the named file (quote it from state.json verbatim). "replace" is the corrected, minimal wording. Only genuine drift — e.g. updating "Humans approve the merge" once auto-land exists. Never invent a metric or capability not evidenced by state.json.

2. addenda — for a field note whose framing has drifted, a short markdown block to APPEND. It will be placed under a "## Update (YYYY-MM-DD)" heading the pipeline adds. It must NEVER restate or edit the note's original body — it acknowledges the change going forward, e.g. "When this was written, humans clicked merge. Since then, reviewed PRs auto-land — see [/how-we-work](/how-we-work)." Link only to pages/notes that exist in state.json, or to https://rarebit.one or https://github.com/rarebit-one/<public-repo>.

Rules: ground EVERY statement in state.json (no fabricated metrics, capabilities, or claims). Never name a client, person, or private repository. Never add an @handle or email. Keep it minimal — a drift sweep, not a rewrite.`;

const prompt = `Here is the current site state:

${JSON.stringify(state, null, 2)}

Review it for genuine drift between the published copy and the farm's actual current capabilities (read the workflow filenames as capability signals). Return STRICT JSON only — no prose, no markdown code fences — with exactly this shape:

{
  "copyEdits": [
    { "file": "src/data/site.ts", "find": "<exact substring currently in the file>", "replace": "<corrected text>", "why": "<one sentence grounded in state.json>" }
  ],
  "addenda": [
    { "slug": "<existing note slug>", "addendum": "<short markdown, appended under an Update heading; must NOT restate the original body>", "why": "<one sentence>" }
  ]
}

Both arrays MAY be empty — propose nothing if nothing is genuinely stale. Do not include any other keys.`;

const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: "claude-opus-4-8",
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: prompt }],
  }),
});

if (!response.ok) {
  console.error(`draft: Anthropic API ${response.status} — ${await response.text()}`);
  process.exit(1);
}

const data = await response.json();
const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");

// The model is asked for bare JSON; tolerate accidental fencing.
const jsonStr = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

let patch;
try {
  patch = JSON.parse(jsonStr);
} catch {
  console.error(`draft: model did not return valid JSON:\n${text.slice(0, 500)}`);
  process.exit(1);
}

// Normalize shape — the validator will hard-check; here we just guarantee the
// two arrays exist so downstream is simple.
const copyEdits = Array.isArray(patch.copyEdits) ? patch.copyEdits : [];
const addenda = Array.isArray(patch.addenda) ? patch.addenda : [];
const out = { copyEdits, addenda };

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`draft: ${copyEdits.length} copy edit(s), ${addenda.length} addendum(s) → ${OUT}`);
