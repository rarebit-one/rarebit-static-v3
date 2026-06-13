// Voice-evolution pipeline · step 2 of 3 — DRAFT (the only LLM call).
//
// The middle of the sandwich. Input is the CURRENT full VOICE.md plus the
// public frontier-lab signal from gather.mjs. The model acts as the farm's
// voice steward: it proposes a SMALL, surgical evolution — tighten a phrase,
// adjust the lexicon, sharpen the *subtle* self-awareness to reflect where AI
// is heading this week. It does NOT rewrite wholesale, and it preserves every
// structural marker. The validator (step 3) is the bounded-diff gate that holds
// it to that; this script just produces the proposal.
//
// One OpenAI chat-completions call per run; model = OPENAI_MODEL repo var
// (default gpt-4o). Missing OPENAI_API_KEY → exit 0 with a notice. Empty signal
// (gather captured nothing, or its file is absent) → exit 0. Both keep the
// workflow green and the voice unchanged.
//
// Input:  argv[2] VOICE.md path (default ./VOICE.md)
//         argv[3] signal.json   (default ./signal.json)
// Output: argv[4] proposal.json (default ./proposal.json)
//         shape { voiceMd, changelog }

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { voiceHeader } from "../lib/voice.mjs";
import { callLLM, hasOpenAIKey } from "../lib/llm.mjs";

const VOICE_PATH = process.argv[2] ?? "VOICE.md";
const SIGNAL_PATH = process.argv[3] ?? "signal.json";
const OUT = process.argv[4] ?? "proposal.json";

const C_START = "<!-- VOICE-CHANGELOG:START -->";
const C_END = "<!-- VOICE-CHANGELOG:END -->";

/**
 * Deterministically restore the protected changelog block.
 *
 * validate.mjs (check 6) REJECTS any proposal whose changelog block (the text
 * between the VOICE-CHANGELOG markers) differs from the current VOICE.md's — the
 * pipeline, not the drafter, prepends the new entry. The model is told to leave
 * that block untouched, but gpt-4o sometimes reword it anyway, which trips the
 * gate and wastes the whole run. We don't loosen the gate; instead we GUARANTEE
 * the input satisfies it: copy the current file's changelog block (markers
 * included) verbatim over whatever the model produced. The model's body nudge
 * (everything outside this block) is preserved and still judged by the
 * bounded-diff gate; only its changelog meddling is silently discarded.
 *
 * If either side is missing a marker block, the proposed text is returned
 * unchanged — validate.mjs's structure check (1) / changelog check (6) then
 * surface the real problem rather than this helper masking it.
 *
 * @param {string} proposedVoiceMd The model's full proposed VOICE.md.
 * @param {string} currentVoiceMd  The current canonical VOICE.md.
 * @returns {string} proposedVoiceMd with its changelog block reset to current's.
 */
export function restoreChangelogBlock(proposedVoiceMd, currentVoiceMd) {
  const cur = String(currentVoiceMd ?? "");
  const pa = String(proposedVoiceMd ?? "").indexOf(C_START);
  const pb = String(proposedVoiceMd ?? "").indexOf(C_END);
  const ca = cur.indexOf(C_START);
  const cb = cur.indexOf(C_END);
  // Either block malformed → leave the proposal as-is for the gate to judge.
  if (pa === -1 || pb === -1 || pb < pa) return String(proposedVoiceMd ?? "");
  if (ca === -1 || cb === -1 || cb < ca) return String(proposedVoiceMd ?? "");
  const currentBlockInner = cur.slice(ca + C_START.length, cb);
  const p = String(proposedVoiceMd);
  return (
    p.slice(0, pa + C_START.length) + currentBlockInner + p.slice(pb)
  );
}

// Mirror of MAX_CHANGED_LINES in validate.mjs — the bounded-diff ceiling the
// drafter must stay under. Kept here so the prompt can state the exact budget;
// if you change it there, change it here. Keeping the two in sync is what makes
// the model's instructions match the gate that judges its output.
const MAX_CHANGED_LINES = 25;

async function main() {
if (!hasOpenAIKey()) {
  console.log("draft: OPENAI_API_KEY not set — skipping (graceful no-op).");
  process.exit(0);
}
if (!existsSync(SIGNAL_PATH)) {
  console.log(`draft: ${SIGNAL_PATH} absent (gather skipped) — skipping (graceful no-op).`);
  process.exit(0);
}

const signal = JSON.parse(readFileSync(SIGNAL_PATH, "utf8"));
if (!Array.isArray(signal.sources) || signal.sources.length === 0) {
  // No public signal this week — there is nothing to react to. Leave the voice
  // untouched rather than invent a nudge.
  console.log("draft: signal is empty (all sources failed) — skipping (graceful no-op).");
  process.exit(0);
}

const currentVoice = readFileSync(VOICE_PATH, "utf8");
const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10); // SGT calendar day

const system = `${voiceHeader()}

You are the farm's VOICE STEWARD. Your job is to keep VOICE.md — the canonical voice of rarebit.one — fresh and true, evolving it in SMALL, bounded steps. You are surgical: you change at most a few lines, you copy everything else through verbatim, you ground every claim in the facts you are given, and you emit only the minimal edit. You tighten; you do not rewrite. An over-ambitious proposal is rejected outright and wastes the week, so err on the side of the smallest change that lands.`;

const prompt = `Here is the CURRENT, full VOICE.md:

<<<VOICE_MD
${currentVoice}
VOICE_MD

Here is this week's PUBLIC signal — recent text scraped from frontier AI labs' news/research pages (use it only to sense where AI is heading; do NOT quote it, do NOT copy any URL or company name out of it):

${JSON.stringify(signal.sources.map((s) => ({ host: s.host, text: s.text })), null, 2)}

Propose a SMALL, surgical evolution of VOICE.md. Return STRICT JSON only — no prose, no markdown code fences — with exactly this shape:

{
  "voiceMd": "<the FULL new VOICE.md content, top to bottom>",
  "changelog": "<one dated, bounded entry — one or two sentences describing the nudge, starting with the date ${today}>"
}

This is the most important constraint, and it is enforced by an automated gate that will REJECT your proposal and discard it if you exceed it:

>>> LINE BUDGET <<<
A downstream validator diffs the current VOICE.md against your "voiceMd" (the changelog block excluded) and counts changed lines. Each line you alter counts TWICE: once for the old line removed, once for the new line added. The hard ceiling is ${MAX_CHANGED_LINES} changed lines, which means you may rewrite AT MOST a handful of lines — realistically ONE to FIVE lines of actual prose. If you reword more than that, the whole proposal is thrown away and the voice does not evolve at all this week. A tiny, accepted nudge beats an ambitious, rejected one.

How to stay inside the budget — follow this literally:
- Reproduce the CURRENT VOICE.md in "voiceMd" BYTE-FOR-BYTE — same headings, same wording, same whitespace, same blank lines, same markers — and change ONLY the few characters of the single edit. Treat every line you are not deliberately editing as frozen; copy it through unchanged. Do NOT "improve", re-flow, re-wrap, re-punctuate, or re-order any other line.
- Make exactly ONE conceptual edit, the smallest that lands this week's signal: tighten a single phrase, swap or add ONE word in the Lexicon, or sharpen ONE self-aware line. Not several edits; one.
- Do not add, remove, split, merge, or reorder lines except as the single edit strictly requires. Keep section order and line breaks identical. Prefer an in-place word swap over inserting a new sentence.
- If this week's public signal does not clearly motivate a change, make the most minimal possible touch (e.g. one tightened word). Never pad the diff to look busy.

Other hard rules (the gate also enforces these):
- Preserve, verbatim and in place, every marker line: "<!-- VOICE-HEADER:START -->", "<!-- VOICE-HEADER:END -->", "<!-- VOICE-CHANGELOG:START -->", "<!-- VOICE-CHANGELOG:END -->". Keep the document structure (headings, sections) intact.
- Keep ALL hard invariants in the VOICE-HEADER: never name or describe a client/product/person/private repo; no hype or marketing adjectives, no exclamation marks, no emoji; British/neutral spelling; ground every claim in the facts. Do not weaken or remove any of these.
- Self-awareness stays SUBTLE — no gimmicks, no "beep boop", no "as an AI", no excessive fourth-wall breaks.
- Do NOT introduce any external URL, email, @handle, or company name into the VOICE-HEADER block — it must stay source-free. Ground the edit only in the facts above; invent nothing.
- The "voiceMd" value must be the complete file content (it replaces VOICE.md entirely). Do NOT pre-edit the changelog block yourself — leave the existing changelog entries exactly as they are, byte-for-byte; the pipeline prepends your new entry. The changelog string you return is that single new entry, beginning with "${today} — ", one or two sentences, source-free.`;

let text;
try {
  text = await callLLM({ system, prompt, maxTokens: 4096, json: true });
} catch (err) {
  console.error(`draft: ${err.message}`);
  process.exit(1);
}

// The model is asked for bare JSON; tolerate accidental fencing.
const jsonStr = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

let proposal;
try {
  proposal = JSON.parse(jsonStr);
} catch {
  console.error(`draft: model did not return valid JSON:\n${text.slice(0, 500)}`);
  process.exit(1);
}

for (const field of ["voiceMd", "changelog"]) {
  if (typeof proposal[field] !== "string" || proposal[field].trim() === "") {
    console.error(`draft: output missing or empty "${field}"`);
    process.exit(1);
  }
}

// Neutralize any changelog meddling deterministically (don't rely on the prompt):
// reset the proposal's changelog block to the current file's, byte-for-byte, so
// validate.mjs's changelog-immutability check (6) can never be tripped by the
// drafter. The model's body nudge survives and is still judged by the gate.
const restored = restoreChangelogBlock(proposal.voiceMd, currentVoice);
if (restored !== proposal.voiceMd) {
  console.log("draft: restored the protected changelog block (drafter had touched it).");
  proposal.voiceMd = restored;
}

writeFileSync(OUT, JSON.stringify(proposal, null, 2));
console.log(`draft: proposed a voice nudge → ${OUT}`);
}

// Run the pipeline only when invoked as a script — importing this module (e.g.
// from draft.test.mjs for restoreChangelogBlock) must NOT execute it or exit.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
