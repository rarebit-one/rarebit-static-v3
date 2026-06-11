// Field-notes pipeline · step 2 of 3 — DRAFT (the only LLM call).
//
// The middle of the "digest sandwich". Input is facts.json from gather.mjs.
// The PUBLIC detail (named PRs/releases + URLs) is fair game — it's public —
// but the PRIVATE side arrives as anonymized category counts only, and the
// `private.blocklist` is STRIPPED before the prompt is built (the model has no
// reason to see private repo names, even to avoid them). The model phrases; it
// does not redact. The validator (step 3) is the gate.
//
// One Anthropic API call per run (claude-opus-4-8). Missing ANTHROPIC_API_KEY
// → exit 0 with a notice. Missing facts.json (gather skipped) → exit 0. Both
// keep the workflow green until secrets are wired up.
//
// Input:  argv[2] (default ./facts.json)
// Output: argv[3] (default ./draft.json) — { title, description, slug, body }

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { voiceHeader } from "../lib/voice.mjs";

const IN = process.argv[2] ?? "facts.json";
const OUT = process.argv[3] ?? "draft.json";
const KEY = process.env.ANTHROPIC_API_KEY;

if (!KEY) {
  console.log("draft: ANTHROPIC_API_KEY not set — skipping (graceful no-op).");
  process.exit(0);
}
if (!existsSync(IN)) {
  // gather.mjs no-op'd (no token) — nothing to draft. Stay green.
  console.log(`draft: ${IN} absent (gather skipped) — skipping (graceful no-op).`);
  process.exit(0);
}

const facts = JSON.parse(readFileSync(IN, "utf8"));

// Strip the private blocklist before it reaches the prompt.
const forModel = {
  ...facts,
  private: facts.private ? (({ blocklist, ...rest }) => rest)(facts.private) : facts.private,
};

const system = `${voiceHeader()}

You are writing this week's Field Note — a calm, concrete log entry, not a marketing post. Use ## section headings.

PUBLIC work may be named and linked, using ONLY the repo names, PR titles, and URLs given in the facts. Do not construct or guess any other URL.

PRIVATE/client work is provided ONLY as anonymized category counts. Refer to it generically — e.g. "across private systems, N runs ran mostly green" — and NEVER name or describe a client, product, person, or private repository, even in passing.

When it is genuinely relevant, you may link to a past field note using its /field-notes/<slug>/ path from the provided pastNotes.

If a "notebook" array is present, it holds OPTIONAL idea-seeds collected by a daily scout — candidate angles you MAY draw on if one fits this week, and should ignore otherwise. They are grounded in public facts, but they are prompts, not facts: you must still ground every published claim and link in the facts above (PRs/releases/repos), and the same anonymization rules apply to anything they hint at.`;

const prompt = `Here are this week's facts (window, public PRs/releases/repos, anonymized private aggregate, past notes, and optional notebook idea-seeds):

${JSON.stringify(forModel, null, 2)}

Write the week's field note. Return STRICT JSON only — no prose, no markdown code fences — with exactly this shape:

{
  "title": "<= 70 characters, no trailing period",
  "description": "one sentence, <= 160 characters",
  "slug": "kebab-case-derived-from-the-title",
  "body": "markdown with ## section headings. Link public PRs and repos using ONLY the URLs provided in the facts. Optionally link one relevant past note via its /field-notes/<slug>/ path. Refer to private work only as anonymized totals."
}

Do not include a pubDate — it is set downstream.`;

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

let draft;
try {
  draft = JSON.parse(jsonStr);
} catch {
  console.error(`draft: model did not return valid JSON:\n${text.slice(0, 500)}`);
  process.exit(1);
}

const required = ["title", "description", "slug", "body"];
for (const field of required) {
  if (typeof draft[field] !== "string" || draft[field].trim() === "") {
    console.error(`draft: output missing or empty "${field}"`);
    process.exit(1);
  }
}

writeFileSync(OUT, JSON.stringify(draft, null, 2));
console.log(`draft: "${draft.title}" (slug: ${draft.slug}) → ${OUT}`);
