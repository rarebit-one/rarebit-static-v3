// Drift ACTOR — the consumer half of the split site-freshness pair (issue #56).
//
// In the sensors/actors paradigm (docs/architecture/sensors-and-actors.md) this
// ACTS: it consumes an open `drift` issue filed by the drift sensor
// (drift-sensor.yml), CLAIMS it (the `in-progress` label, so an overlapping run
// won't double-process it), and signals the workflow which issue it took.
//
// Unlike voice, freshness reads the WORKTREE, which is the source of truth at the
// actor's own run time — so the actor re-gathers fresh state itself (the workflow
// runs scripts/freshness/gather.mjs again) rather than trusting a stale snapshot
// carried in the marker. The `drift` issue is the discrete "a sweep is queued"
// work item; this actor only claims it and writes claim.json ({ issue: <n> }) so
// the workflow can reference it.
//
// The workflow then runs the UNCHANGED scripts/freshness/draft.mjs +
// scripts/freshness/validate.mjs (the gate that preserves note prose byte-for-byte
// — reused verbatim) and, if the worktree changed, opens an `auto-land` PR whose
// body says `Closes #<n>`, so the issue closes when the PR MERGES (mirroring how
// field-notes closes its seed on publish). On a NO-OP / empty-patch sweep, the
// claim is RELEASED (in-progress cleared) so a later run retries — the queue
// self-heals.
//
// Graceful: no open `drift` issue → no-op (exit 0). No GitHub token → no-op. A
// missing label is created (ensureLabel via claimIssue) so a fresh repo never
// errors (#55).
//
// Output: argv[2] claim.json (default ./claim.json) — { issue }

import { writeFileSync } from "node:fs";
import { claimIssue, ensureLabel, listOpenIssues } from "../lib/issues.mjs";

const CLAIM_OUT = process.argv[2] ?? "claim.json";
const LABEL = "drift";

// Ensure the label exists so listOpenIssues never errors on a fresh repo (#55).
ensureLabel(LABEL, "D93F0B", "A weekly site-freshness drift sweep is warranted (drift sensor → actor)");

const open = listOpenIssues(LABEL);
if (open.length === 0) {
  console.log(`act: no open ${LABEL} issue to consume — nothing to do (no-op).`);
  process.exit(0);
}

// Take the OLDEST open drift request (lowest issue number) — FIFO over the queue.
const drift = [...open].sort((a, b) => a.number - b.number)[0];

// CLAIM before the slow work so an overlapping actor run won't double-process it.
if (!claimIssue(drift.number)) {
  console.log(`act: could not claim #${drift.number} (no token / API error) — no-op.`);
  process.exit(0);
}

writeFileSync(CLAIM_OUT, JSON.stringify({ issue: drift.number }, null, 2));

console.log(
  `act: claimed ${LABEL} issue #${drift.number} → ${CLAIM_OUT}. ` +
    `The workflow now re-gathers state, runs draft + validate (the freshness gate) and, ` +
    `on a real diff, opens an auto-land PR that Closes #${drift.number}.`
);
