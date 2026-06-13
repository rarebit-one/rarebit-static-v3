// Voice SENSOR — the producer half of the split voice-evolution pair (issue #56).
//
// In the sensors/actors paradigm (docs/architecture/sensors-and-actors.md), this
// is a SENSOR: it turns external input (this week's public frontier-lab signal)
// into a discrete, labeled work item — an OPEN `voice-proposal` GitHub issue —
// and then STOPS. It does NOT edit VOICE.md, call the LLM, or open a PR. The
// actor half (act.mjs) consumes the issue and makes the bounded edit. The two
// share only the `voice-proposal` label + the marker schema; neither imports the
// other.
//
// Pipeline: gather (scripts/voice/gather.mjs writes signal.json — robust,
// per-source try/catch, public, no secret) → THIS sensor reads signal.json and,
// if there is signal, emits ONE `voice-proposal` issue whose marker carries the
// signal sources so the actor needn't re-fetch:
//   <!-- voice-proposal:{"signal":{"sources":[…]},"sensed":"<iso>"} -->
//
// DEDUP: at most ONE open `voice-proposal` at a time — if one is already open we
// emit nothing (the actor hasn't consumed the last one yet; piling on would just
// queue stale signal). This is the by-existence dedup the queue needs so a weekly
// re-run never double-files.
//
// Graceful: empty/absent signal → no-op (exit 0). No GitHub token → no-op. A
// missing label is created (ensureLabel) so a fresh repo never errors (#55).
//
// Input:  argv[2] signal.json (default ./signal.json)
// Effect: opens at most one `voice-proposal` issue.

import { existsSync, readFileSync } from "node:fs";
import { emitIssue, ensureLabel, listOpenIssues } from "../lib/issues.mjs";

const SIGNAL_PATH = process.argv[2] ?? "signal.json";
const LABEL = "voice-proposal";

if (!existsSync(SIGNAL_PATH)) {
  console.log(`sense: ${SIGNAL_PATH} absent (gather skipped) — skipping (graceful no-op).`);
  process.exit(0);
}

const signal = JSON.parse(readFileSync(SIGNAL_PATH, "utf8"));
const sources = Array.isArray(signal?.sources) ? signal.sources : [];
if (sources.length === 0) {
  // No public signal this week — nothing to propose. Leave the queue untouched.
  console.log("sense: signal is empty (all sources failed) — nothing to propose (no-op).");
  process.exit(0);
}

// Ensure the label exists up front so a missing label never errors (#55 hardening),
// even on the no-token path below where emitIssue would otherwise no-op silently.
ensureLabel(LABEL, "5319E7", "Proposed bounded VOICE.md change (voice sensor → voice actor)");

// DEDUP — one open proposal at a time. If the actor hasn't consumed the last
// `voice-proposal` yet, don't stack another; the queue would just hold stale signal.
const open = listOpenIssues(LABEL);
if (open.length > 0) {
  console.log(
    `sense: ${open.length} open ${LABEL} issue(s) already pending (#${open
      .map((i) => i.number)
      .join(", #")}) — not emitting another (no-op).`
  );
  process.exit(0);
}

// Carry only what the actor needs: the public signal sources (host + text), the
// same shape draft.mjs consumes. No identifiers — this is public lab text only.
const carried = sources.map((s) => ({ url: s.url, host: s.host, text: s.text }));
const hosts = [...new Set(carried.map((s) => s.host))].filter(Boolean);

const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10); // SGT
const title = `Voice proposal — weekly bounded VOICE.md nudge (${today})`;
const body = [
  "A weekly bounded evolution of `VOICE.md` is warranted from this week's public frontier-lab signal.",
  "",
  `**Signal captured from:** ${hosts.length ? hosts.join(", ") : "(no hosts)"}`,
  "",
  "The **voice actor** will consume this issue: it runs `scripts/voice/draft.mjs`",
  "(one OpenAI call — a small, surgical proposal) then `scripts/voice/validate.mjs`",
  "(the bounded-diff gate from #54), and opens an `auto-land` PR with the new",
  "`VOICE.md`. This issue closes when that PR merges. The signal sources are carried",
  "in the hidden marker below so the actor need not re-fetch them.",
].join("\n");

const num = emitIssue({
  label: LABEL,
  title,
  body,
  data: { signal: { sources: carried }, sensed: new Date().toISOString() },
});

if (num) {
  console.log(`sense: opened ${LABEL} issue #${num} (${carried.length} signal source(s)).`);
} else {
  console.log("sense: no issue opened (no token, or create failed) — graceful no-op.");
}
