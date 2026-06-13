// Field-notes pipeline · step 2 of 3 — DRAFT (the only LLM call).
//
// The middle of the "digest sandwich". Input is facts.json from gather.mjs.
// The PUBLIC detail (named PRs/releases + URLs) is fair game — it's public —
// but the PRIVATE side arrives as anonymized category counts only, and the
// `private.blocklist` is STRIPPED before the prompt is built (the model has no
// reason to see private repo names, even to avoid them). The model phrases; it
// does not redact. The validator (step 3) is the gate.
//
// One OpenAI chat-completions call per run; model = OPENAI_MODEL repo var
// (default gpt-4o). Missing OPENAI_API_KEY → exit 0 with a notice. Missing
// facts.json (gather skipped) → exit 0. Both keep the workflow green until
// secrets are wired up.
//
// Input:  argv[2] (default ./facts.json)
// Output: argv[3] (default ./draft.json) — { title, description, slug, body }

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { voiceHeader } from "../lib/voice.mjs";
import { callLLM, hasOpenAIKey } from "../lib/llm.mjs";
import { resolveUsedSeeds } from "./seeds.mjs";

const IN = process.argv[2] ?? "facts.json";
const OUT = process.argv[3] ?? "draft.json";

if (!hasOpenAIKey()) {
  console.log("draft: OPENAI_API_KEY not set — skipping (graceful no-op).");
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

NAMING RULE — read carefully. You may name and link rarebit-one's OWN public repositories — by their bare name (e.g. "standard_id", "standard_health", "rarebit-static-v3") and via their github.com/rarebit-one/<repo> URLs. That is the entire point of a field note: a public log of rarebit-one's own work. But you must NEVER name any OTHER organization or its projects — not even when such a name appears inside a rarebit-one public PR's title or body. In particular, a split-out sibling org named "luminality" (its repos "luminality-web", "luminality-app", "luminality-ui", and the org "luminalityai") must NEVER be named: refer to it generically ("a sibling project", "another org") or omit it entirely. Likewise never name a client, never name a private or internal-only repository, and never invent a metric — ground every number and link in the facts above.

PRIVATE/client work is provided ONLY as anonymized category counts. Refer to it generically — e.g. "across private systems, N runs ran mostly green" — and NEVER name or describe a client, product, person, or private repository, even in passing.

When it is genuinely relevant, you may link to a past field note using its /field-notes/<slug>/ path from the provided pastNotes.

If a "notebook" array is present, it holds OPTIONAL idea-seeds collected by a daily scout — candidate angles you MAY draw on if one fits this week, and should ignore otherwise. Each seed carries an "issue" number. They are grounded in public facts, but they are prompts, not facts: you must still ground every published claim and link in the facts above (PRs/releases/repos), and the same anonymization rules apply to anything they hint at. If you genuinely drew on one or more seeds, list their issue numbers in "usedSeedIssues"; otherwise omit it or use an empty array.`;

const prompt = `Here are this week's facts (window, public PRs/releases/repos, anonymized private aggregate, past notes, and optional notebook idea-seeds):

${JSON.stringify(forModel, null, 2)}

Write the week's field note. Return STRICT JSON only — no prose, no markdown code fences — with exactly this shape:

{
  "title": "<= 70 characters, no trailing period",
  "description": "one sentence, <= 160 characters",
  "slug": "kebab-case-derived-from-the-title",
  "body": "markdown with ## section headings. Link public PRs and repos using ONLY the URLs provided in the facts. Optionally link one relevant past note via its /field-notes/<slug>/ path. Refer to private work only as anonymized totals.",
  "usedSeedIssues": []
}

"usedSeedIssues" is OPTIONAL — an array of the notebook seed issue numbers you actually drew on (empty or omitted if none). Do not include a pubDate — it is set downstream.`;

let text;
try {
  text = await callLLM({ system, prompt, maxTokens: 2048, json: true });
} catch (err) {
  console.error(`draft: ${err.message}`);
  process.exit(1);
}

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

// Resolve which seed issues this note actually used — DETERMINISTICALLY, by
// matching each seed's grounding URLs against the published body, rather than
// trusting the model's self-reported `usedSeedIssues` (gpt-4o routinely returns
// an empty array even when it drew on a seed, so seeds never closed). The
// model's claim is unioned in but filtered to seeds it was actually given.
// The workflow closes these after publish. See scripts/field-notes/seeds.mjs.
const usedSeedIssues = resolveUsedSeeds({
  seeds: facts.notebook,
  body: draft.body,
  modelClaimed: draft.usedSeedIssues,
});
draft.usedSeedIssues = usedSeedIssues;

writeFileSync(OUT, JSON.stringify(draft, null, 2));
console.log(
  `draft: "${draft.title}" (slug: ${draft.slug})` +
    `${usedSeedIssues.length ? `, used seeds #${usedSeedIssues.join(", #")}` : ""} → ${OUT}`
);
