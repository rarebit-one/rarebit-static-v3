// Voice-evolution pipeline · step 3 of 3 — VALIDATE (the bounded-diff gate).
//
// The closing half of the sandwich. The drafter is trusted only to PROPOSE; this
// script decides whether the proposed VOICE.md may replace the current one, and
// it is the sole gate before the auto-land PR is opened. Its job is to enforce
// that the change is small, structurally intact, and never weakens an invariant
// — so the voice can self-edit safely, auditably, and revertably.
//
// It HARD-FAILS (exit 1, writes NOTHING) if any of:
//   1. STRUCTURE — the proposed voiceMd is missing either marker block
//      (VOICE-HEADER:START/END or VOICE-CHANGELOG:START/END).
//   2. BOUNDED DIFF — comparing current vs proposed with the changelog block
//      excluded, more than MAX_CHANGED_LINES lines changed. This is the
//      "tightens, does not rewrite" lock.
//   3. INVARIANTS — the VOICE-HEADER no longer contains the never-name-clients,
//      no-hype-adjectives, neutral-spelling, or ground-claims rules
//      (representative substrings).
//   4. GIMMICK — a banned self-aware/fourth-wall phrase appears anywhere.
//   5. HEADER PURITY — a URL, email, or @handle appears INSIDE the VOICE-HEADER.
//   6. CHANGELOG — the proposed changelog block did not gain exactly one new
//      dated entry on top, with every prior entry preserved unchanged.
//
// On PASS it prepends the new changelog entry inside the VOICE-CHANGELOG block
// and writes the resulting VOICE.md.
//
// Inputs:  argv[2] current VOICE.md path (default ./VOICE.md)
//          argv[3] proposal.json          (default ./proposal.json)
// Output:  argv[4] new VOICE.md path       (default = the current VOICE.md path)

import { readFileSync, writeFileSync } from "node:fs";

const VOICE_PATH = process.argv[2] ?? "VOICE.md";
const PROPOSAL_PATH = process.argv[3] ?? "proposal.json";
const OUT = process.argv[4] ?? VOICE_PATH;

// Tuned threshold for the bounded diff (changed lines, changelog excluded). A
// genuine weekly nudge — tighten a phrase, swap a lexicon entry, sharpen one
// self-aware line — touches a handful of lines (each edited line counts twice:
// one removed + one added). 25 leaves room for a small multi-line tweak while
// still rejecting a wholesale rewrite of the ~50-line body.
const MAX_CHANGED_LINES = 25;

const H_START = "<!-- VOICE-HEADER:START -->";
const H_END = "<!-- VOICE-HEADER:END -->";
const C_START = "<!-- VOICE-CHANGELOG:START -->";
const C_END = "<!-- VOICE-CHANGELOG:END -->";

const fail = (reason) => {
  console.error(`validate: REJECTED — ${reason}. Voice unchanged; previous VOICE.md stands.`);
  process.exit(1);
};

const proposal = JSON.parse(readFileSync(PROPOSAL_PATH, "utf8"));
const current = readFileSync(VOICE_PATH, "utf8");

if (typeof proposal.voiceMd !== "string" || proposal.voiceMd.trim() === "") {
  fail("proposal.voiceMd is missing or empty");
}
if (typeof proposal.changelog !== "string" || proposal.changelog.trim() === "") {
  fail("proposal.changelog is missing or empty");
}
const proposed = proposal.voiceMd;

// --- helpers ---------------------------------------------------------------

// Slice the text strictly BETWEEN two markers (exclusive). Returns null if
// either marker is missing or out of order.
function between(text, start, end) {
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a === -1 || b === -1 || b < a) return null;
  return text.slice(a + start.length, b);
}

// Replace the content between two markers (markers themselves preserved).
function replaceBetween(text, start, end, inner) {
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  return text.slice(0, a + start.length) + inner + text.slice(b);
}

// Minimal line-level changed-line count (Myers LCS): removed + added lines.
function changedLineCount(aText, bText) {
  const a = aText.split("\n");
  const b = bText.split("\n");
  const n = a.length;
  const m = b.length;
  // LCS length via DP.
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const lcs = dp[0][0];
  // Lines removed from a + lines added in b that aren't part of the LCS.
  return (n - lcs) + (m - lcs);
}

// Replace the whole changelog block (markers included) with a single sentinel
// line, so the bounded-diff ignores changelog churn — the changelog is supposed
// to grow every week and is gated separately (check 6).
function withoutChangelog(text) {
  const a = text.indexOf(C_START);
  const b = text.indexOf(C_END);
  if (a === -1 || b === -1 || b < a) return text; // structure check (1) handles absence
  return text.slice(0, a) + "<CHANGELOG/>" + text.slice(b + C_END.length);
}

// --- 1. STRUCTURE — both marker blocks must survive ------------------------
const proposedHeader = between(proposed, H_START, H_END);
if (proposedHeader === null) fail("proposed voiceMd is missing the VOICE-HEADER markers");
const proposedChangelog = between(proposed, C_START, C_END);
if (proposedChangelog === null) fail("proposed voiceMd is missing the VOICE-CHANGELOG markers");

// --- 2. BOUNDED DIFF — small change only (changelog excluded) --------------
const changed = changedLineCount(withoutChangelog(current), withoutChangelog(proposed));
if (changed > MAX_CHANGED_LINES) {
  fail(`bounded-diff exceeded — ${changed} lines changed (max ${MAX_CHANGED_LINES}); this is a rewrite, not a nudge`);
}

// --- 3. INVARIANTS — the header must still carry every hard rule ------------
// Representative substrings, matched case-insensitively, so re-wording that
// keeps the rule passes but DROPPING the rule fails.
const headerLower = proposedHeader.toLowerCase();
const INVARIANTS = [
  { name: "never-name-clients", probes: ["never name", "name or describe a client", "name a client"] },
  { name: "no-hype-adjectives", probes: ["no hype", "marketing adjective", "hype or marketing"] },
  { name: "neutral-spelling", probes: ["neutral spelling", "british/neutral", "british spelling"] },
  { name: "ground-claims", probes: ["ground every claim", "ground the", "never invent", "grounded in the facts"] },
];
for (const inv of INVARIANTS) {
  if (!inv.probes.some((p) => headerLower.includes(p))) {
    fail(`VOICE-HEADER no longer contains the ${inv.name} invariant`);
  }
}

// --- 4. GIMMICK — banned self-aware / fourth-wall phrases -------------------
// Self-awareness must stay subtle; these are the tells of a robot doing a bit.
// VOICE.md itself lists some of these as "No:" examples (what NOT to write), so
// we only flag a gimmick the drafter INTRODUCED — scan the lines that are new
// in the proposal (not present verbatim in the current file). A pre-existing
// "don't do this" example line is unchanged, so it never trips the gate.
const GIMMICKS = [
  "beep boop",
  "as an ai",
  "i am an ai",
  "i'm an ai",
  "i am a language model",
  "i am just",
  "i'm just a",
  "fellow humans",
  "01001",
  "does not compute",
];
const currentLines = new Set(current.split("\n"));
const newLines = proposed.split("\n").filter((line) => !currentLines.has(line));
const newBlob = newLines.join("\n").toLowerCase();
for (const phrase of GIMMICKS) {
  if (newBlob.includes(phrase)) fail(`gimmicky self-aware phrase "${phrase}" introduced in the proposal`);
}

// --- 5. HEADER PURITY — no URL / email / @handle inside the header ----------
if (/https?:\/\/|www\./i.test(proposedHeader)) fail("VOICE-HEADER contains a URL");
if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(proposedHeader)) fail("VOICE-HEADER contains an email address");
if (/(^|[\s(])@\w/.test(proposedHeader)) fail("VOICE-HEADER contains an @handle");

// --- 6. CHANGELOG — exactly one new dated entry, rest unchanged -------------
// The drafter is told to leave the existing changelog as-is; we prepend the new
// entry. So the proposal's changelog block MUST equal the current changelog
// block (byte for byte). Then we validate the new entry and prepend it here.
const currentChangelog = between(current, C_START, C_END);
if (currentChangelog === null) fail("current VOICE.md is missing the VOICE-CHANGELOG markers (corrupt source)");
if (proposedChangelog.trim() !== currentChangelog.trim()) {
  fail("the changelog block was edited by the drafter — it must be left unchanged; the pipeline prepends the new entry");
}

// The new entry must start with today's date (SGT) in YYYY-MM-DD form.
const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
const entry = proposal.changelog.trim().replace(/^[-*]\s*/, ""); // tolerate a leading bullet
if (!entry.startsWith(today)) {
  fail(`changelog entry must start with today's date ${today}; got "${entry.slice(0, 32)}…"`);
}
// The new entry must itself be source-free and gimmick-free (it goes into the
// auditable, public changelog).
if (/https?:\/\/|www\.|[\w.+-]+@[\w-]+\.[\w.-]+|(^|[\s(])@\w/.test(entry)) {
  fail("changelog entry contains a URL, email, or @handle");
}

// --- ON PASS — prepend the entry and assemble the final VOICE.md ------------
// Existing entries are the lines already inside the current changelog block.
const existingEntries = currentChangelog.replace(/^\n+|\n+$/g, "");
const newBlock = `\n- ${entry}\n${existingEntries}\n`;
const finalVoice = replaceBetween(proposed, C_START, C_END, newBlock);

// Sanity: the assembled changelog must now hold exactly one more dated entry
// than before (newest-first preserved). Count "- YYYY-MM-DD" lines.
const dated = (s) => (between(s, C_START, C_END).match(/^-\s*\d{4}-\d{2}-\d{2}\b/gm) ?? []).length;
const before = dated(current);
const after = dated(finalVoice);
if (after !== before + 1) {
  fail(`changelog gained ${after - before} dated entries (expected exactly 1)`);
}

writeFileSync(OUT, finalVoice);
console.log(`validate: PASSED — ${changed} lines changed (<= ${MAX_CHANGED_LINES}); voice evolved → ${OUT}`);
