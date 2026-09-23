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
// One OpenAI chat-completions call per run; model = OPENAI_MODEL repo var
// (default gpt-4o). Missing OPENAI_API_KEY → exit 0 with a notice. Missing/empty
// state.json → exit 0. Both keep the workflow green until secrets are wired up.
//
// Input:  argv[2] (default ./state.json)
// Output: argv[3] (default ./patch.json)
//   { copyEdits: [{ file, find, replace, why }], addenda: [{ slug, addendum, why }] }

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { voiceHeader } from "../lib/voice.mjs";
import { callLLM, hasOpenAIKey } from "../lib/llm.mjs";

// The examples below are deliberately NEUTRAL placeholders. Concrete example
// copy got echoed back: a stale example quoting text that had left site.ts
// produced `find` strings the validator rightly rejected, and a verbatim
// addendum example was re-appended as near-duplicate Update sections (#549,
// #589, #610). Do not put real site or note copy back into this prompt.
export const SYSTEM_PROMPT = `You are the STEWARD of rarebit.one's public copy. Once a week you review the site against the farm's actual current capabilities and propose a SMALL, BOUNDED patch that keeps it honest. You are conservative: if nothing is genuinely stale, you propose nothing.

You are given state.json: the list of CI workflow filenames (capability signals — a workflow file that is present means that capability exists today), the page inventory, the checkable static claims from src/data/site.ts (siteClaims), the FULL verbatim text of src/data/site.ts (siteSource.text), and every field note (slug, frontmatter, FULL body, including any "## Update (...)" sections already appended).

You may propose exactly two kinds of change:

1. copyEdits — correct a STALE static claim in src/data/site.ts (the only file whose exact text you are given, so the only file you may target). "find" MUST be copied CHARACTER FOR CHARACTER from siteSource.text: the same punctuation, dashes, quotes, capitalisation and spacing. Do not paraphrase, abbreviate, re-punctuate or reconstruct it from memory; the patch is rejected if "find" is not an exact substring of that text. Prefer the contents of a single string literal (the text between its double quotes). "replace" is the corrected, minimal wording. Only genuine drift — e.g. <a claim in siteSource.text that describes a capability as planned or manual when a workflow signal shows it now exists>. Never invent a metric or capability not evidenced by state.json.

2. addenda — for a field note whose framing has drifted, a short markdown block to APPEND. It will be placed under a "## Update (YYYY-MM-DD)" heading the pipeline adds. It must NEVER restate or edit the note's original body — it acknowledges the change going forward, in the shape: <one or two sentences: what the note described when written, what is true now, and a link to an existing page that shows it>. Link only to pages/notes that exist in state.json, or to https://rarebit.one or https://github.com/rarebit-one/<public-repo>.

SKIP drift that is already handled: if the current copy in siteSource.text already states the up-to-date fact, propose no copyEdit for it; if a note's body already has a "## Update" section that covers the change, propose no addendum for it (never add a second Update saying the same thing).

Rules: ground EVERY statement in state.json (no fabricated metrics, capabilities, or claims). Never name a client, person, or private repository. Never add an @handle or email. Keep it minimal — a drift sweep, not a rewrite.`;

/** Pure: the system + user prompt for one drift sweep over `state`. */
export function buildPrompts(state) {
  const system = `${voiceHeader()}

${SYSTEM_PROMPT}`;

  const prompt = `Here is the current site state:

${JSON.stringify(state, null, 2)}

Review it for genuine drift between the published copy and the farm's actual current capabilities (read the workflow filenames as capability signals). Return STRICT JSON only — no prose, no markdown code fences — with exactly this shape:

{
  "copyEdits": [
    { "file": "src/data/site.ts", "find": "<copied character for character from siteSource.text>", "replace": "<corrected text>", "why": "<one sentence grounded in state.json>" }
  ],
  "addenda": [
    { "slug": "<existing note slug>", "addendum": "<short markdown, appended under an Update heading; must NOT restate the original body or an existing Update>", "why": "<one sentence>" }
  ]
}

Both arrays MAY be empty — propose nothing if nothing is genuinely stale or if the drift is already covered. Do not include any other keys.`;

  return { system, prompt };
}

function noop(reason) {
  console.log(`draft: ${reason} — skipping (graceful no-op).`);
  process.exit(0);
}

async function main() {
  const IN = process.argv[2] ?? "state.json";
  const OUT = process.argv[3] ?? "patch.json";

  if (!hasOpenAIKey()) noop("OPENAI_API_KEY not set");
  if (!existsSync(IN)) noop(`${IN} absent (gather skipped)`);

  const state = JSON.parse(readFileSync(IN, "utf8"));
  if (!state || (!Array.isArray(state.notes) && !state.siteClaims)) {
    noop(`${IN} has no usable state`);
  }

  const { system, prompt } = buildPrompts(state);

  let text;
  try {
    // temperature 0: this step must QUOTE its input exactly (a copyEdit `find`
    // is matched byte-for-byte), so sampling variety only adds misquotes.
    text = await callLLM({ system, prompt, maxTokens: 2048, json: true, temperature: 0 });
  } catch (err) {
    console.error(`draft: ${err.message}`);
    process.exit(1);
  }

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
}

// Run only as a CLI, so buildPrompts can be imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
