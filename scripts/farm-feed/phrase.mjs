// Farm-feed pipeline · step 2 of 3 — PHRASE (the only LLM call).
//
// The middle of the "digest sandwich". Input is the SANITIZED aggregate from
// gather.mjs — categories, counts, timestamps, conclusions, never raw client
// data — so the model cannot leak what it never sees. Its job is phrasing
// only: a one-line day digest + a few generic phrase variants per category.
// The script (validate.mjs) assembles per-event rows from these templates;
// the model never emits per-event text or any identifier.
//
// One Anthropic API call per run (claude-haiku-4-5 — pennies/day). Missing
// ANTHROPIC_API_KEY → exit 0 with a notice so the workflow no-ops until
// secrets are wired up.
//
// Input:  argv[2] (default ./sanitized.json)
// Output: argv[3] (default ./phrased.json) — { digest, phrases: {cat: [...]} }

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { voiceHeader } from "../lib/voice.mjs";

const IN = process.argv[2] ?? "sanitized.json";
const OUT = process.argv[3] ?? "phrased.json";
const KEY = process.env.ANTHROPIC_API_KEY;

if (!KEY) {
  console.log("phrase: ANTHROPIC_API_KEY not set — skipping (graceful no-op).");
  process.exit(0);
}
if (!existsSync(IN)) {
  // gather.mjs no-op'd (no FEED_GITHUB_PAT) — nothing to phrase. Stay green.
  console.log(`phrase: ${IN} absent (gather skipped) — skipping (graceful no-op).`);
  process.exit(0);
}

const sanitized = JSON.parse(readFileSync(IN, "utf8"));

// Strip the blocklist before it reaches the prompt — the model has no reason
// to see repo names or member logins, even to avoid them.
const { blocklist, ...forModel } = sanitized;

const system = `${voiceHeader()}

You are writing a terse activity ticker — a calm factory log. The data is already anonymized to category counts; phrase it, never invent specifics. Keep lines short and plain; no self-aware asides at this length.`;

const prompt = `Here is yesterday's aggregated private-workflow activity (categories + counts only, fully anonymized):

${JSON.stringify(forModel, null, 2)}

Produce STRICT JSON (no markdown, no prose around it) with this shape:
{
  "digest": "one sentence, <= 140 chars, summarizing the day — reference run count, that it spans private systems, the category mix, and the green %. Do NOT name systems or counts of systems beyond what's in totals.",
  "phrases": {
    "<category>": ["variant 1", "variant 2", "variant 3"]
  }
}

Rules for phrases:
- One key per category present in "categories". 2-3 variants each.
- Each variant is a short generic status line a factory ticker would show, e.g. "deployment completed", "test suite ran clean", "scheduled job finished". <= 48 chars.
- Generic ONLY — never reference a client, product, repo, person, URL, or specific number.
- Do not append the outcome (green/failed) — the assembler adds that.`;

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
  console.error(`phrase: Anthropic API ${response.status} — ${await response.text()}`);
  process.exit(1);
}

const data = await response.json();
const text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");

// The model is asked for bare JSON; tolerate accidental fencing.
const jsonStr = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

let phrased;
try {
  phrased = JSON.parse(jsonStr);
} catch {
  console.error(`phrase: model did not return valid JSON:\n${text.slice(0, 500)}`);
  process.exit(1);
}

if (typeof phrased.digest !== "string" || typeof phrased.phrases !== "object" || !phrased.phrases) {
  console.error("phrase: output missing digest/phrases");
  process.exit(1);
}

writeFileSync(OUT, JSON.stringify(phrased, null, 2));
console.log(`phrase: digest + ${Object.keys(phrased.phrases).length} category templates (${OUT})`);
