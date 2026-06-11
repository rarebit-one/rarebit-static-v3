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
// One Anthropic API call per run (claude-opus-4-8). Missing ANTHROPIC_API_KEY
// → exit 0 with a notice. Empty signal (gather captured nothing, or its file is
// absent) → exit 0. Both keep the workflow green and the voice unchanged.
//
// Input:  argv[2] VOICE.md path (default ./VOICE.md)
//         argv[3] signal.json   (default ./signal.json)
// Output: argv[4] proposal.json (default ./proposal.json)
//         shape { voiceMd, changelog }

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { voiceHeader } from "../lib/voice.mjs";

const VOICE_PATH = process.argv[2] ?? "VOICE.md";
const SIGNAL_PATH = process.argv[3] ?? "signal.json";
const OUT = process.argv[4] ?? "proposal.json";
const KEY = process.env.ANTHROPIC_API_KEY;

if (!KEY) {
  console.log("draft: ANTHROPIC_API_KEY not set — skipping (graceful no-op).");
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

You are the farm's VOICE STEWARD. Your job is to keep VOICE.md — the canonical voice of rarebit.one — fresh and true, evolving it in SMALL, bounded steps. You tighten; you do not rewrite.`;

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

Hard rules for the proposal:
- Make ONE small change: tighten a phrase, adjust a lexicon entry, or sharpen the SUBTLE self-awareness so it reflects where AI is heading this week. Do NOT rewrite wholesale; the diff must be a handful of lines.
- Preserve, verbatim and in place, every marker line: "<!-- VOICE-HEADER:START -->", "<!-- VOICE-HEADER:END -->", "<!-- VOICE-CHANGELOG:START -->", "<!-- VOICE-CHANGELOG:END -->". Keep the document structure (headings, sections) intact.
- Keep ALL hard invariants in the VOICE-HEADER: never name or describe a client/product/person/private repo; no hype or marketing adjectives, no exclamation marks, no emoji; British/neutral spelling; ground every claim in the facts. Do not weaken or remove any of these.
- Self-awareness stays SUBTLE — no gimmicks, no "beep boop", no "as an AI", no excessive fourth-wall breaks.
- Do NOT introduce any external URL, email, @handle, or company name into the VOICE-HEADER block — it must stay source-free.
- The "voiceMd" value must be the complete file content (it replaces VOICE.md entirely). Do NOT pre-edit the changelog block yourself — leave the existing changelog entries exactly as they are; the pipeline prepends your new entry. The changelog string you return is that single new entry, beginning with "${today} — ".`;

const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: "claude-opus-4-8",
    max_tokens: 4096,
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

writeFileSync(OUT, JSON.stringify(proposal, null, 2));
console.log(`draft: proposed a voice nudge → ${OUT}`);
