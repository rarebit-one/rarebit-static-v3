// Voice ACTOR — the consumer half of the split voice-evolution pair (issue #56).
//
// In the sensors/actors paradigm (docs/architecture/sensors-and-actors.md), this
// is an ACTOR: it reads the queue (open `voice-proposal` issues filed by the voice
// sensor, sense.mjs), CLAIMS one (the `in-progress` label, so an overlapping run
// won't double-process it), recovers the carried public signal from the issue's
// marker, and reproduces the signal.json the existing draft/validate sandwich
// consumes. It does NOT scan frontier labs itself — the sensor already did; the
// actor trusts the queue (the issue is the trust boundary). Neither half imports
// the other.
//
// This script only PREPARES the work: it claims the issue and writes signal.json
// + a tiny claim.json ({ issue: <n> }) for the workflow. The workflow then runs
// the UNCHANGED scripts/voice/draft.mjs + scripts/voice/validate.mjs (the #54
// bounded-diff gate — reused verbatim) and, if VOICE.md changed, opens an
// `auto-land` PR whose body says `Closes #<n>`, so the issue closes when the PR
// MERGES (mirroring how field-notes closes its seed on publish). On a NO-OP /
// rejected gate, the issue is left OPEN (and the in-progress label cleared) so a
// later run retries — the queue self-heals.
//
// Graceful: no open proposal → no-op (exit 0). No GitHub token → no-op. A missing
// label is created (ensureLabel via claimIssue) so a fresh repo never errors (#55).
//
// Output: argv[2] signal.json (default ./signal.json) — { generated, sources }
//         argv[3] claim.json  (default ./claim.json)  — { issue }

import { writeFileSync } from "node:fs";
import { claimIssue, ensureLabel, listOpenIssues } from "../lib/issues.mjs";

const SIGNAL_OUT = process.argv[2] ?? "signal.json";
const CLAIM_OUT = process.argv[3] ?? "claim.json";
const LABEL = "voice-proposal";

// Ensure the label exists so listOpenIssues never errors on a fresh repo (#55).
ensureLabel(LABEL, "5319E7", "Proposed bounded VOICE.md change (voice sensor → voice actor)");

const open = listOpenIssues(LABEL);
if (open.length === 0) {
  console.log(`act: no open ${LABEL} issue to consume — nothing to do (no-op).`);
  process.exit(0);
}

// Take the OLDEST open proposal (lowest issue number) — FIFO over the queue.
const proposal = [...open].sort((a, b) => a.number - b.number)[0];
const carried = Array.isArray(proposal.data?.signal?.sources)
  ? proposal.data.signal.sources
  : [];

if (carried.length === 0) {
  // The marker is missing or carried no signal — there is nothing to act on. Leave
  // the issue OPEN (don't claim) so it's visible for triage rather than silently
  // consumed. A malformed proposal shouldn't burn the slot.
  console.log(
    `act: ${LABEL} issue #${proposal.number} carries no signal in its marker — leaving it open for triage (no-op).`
  );
  process.exit(0);
}

// CLAIM before the slow work so an overlapping actor run won't double-process it.
if (!claimIssue(proposal.number)) {
  console.log(`act: could not claim #${proposal.number} (no token / API error) — no-op.`);
  process.exit(0);
}

// Reconstruct the signal.json shape draft.mjs expects: { generated, sources }.
const signal = {
  generated: new Date().toISOString(),
  sources: carried
    .filter((s) => s && typeof s.text === "string")
    .map((s) => ({ url: s.url ?? "", host: s.host ?? "", text: s.text })),
};
writeFileSync(SIGNAL_OUT, JSON.stringify(signal, null, 2));
writeFileSync(CLAIM_OUT, JSON.stringify({ issue: proposal.number }, null, 2));

console.log(
  `act: claimed ${LABEL} issue #${proposal.number}; wrote ${signal.sources.length} signal source(s) → ${SIGNAL_OUT}. ` +
    `The workflow now runs draft + validate (the #54 gate) and, on a real diff, opens an auto-land PR that Closes #${proposal.number}.`
);
