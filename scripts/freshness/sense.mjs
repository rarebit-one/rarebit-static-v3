// Drift SENSOR — the producer half of the split site-freshness pair (issue #56).
//
// In the sensors/actors paradigm (docs/architecture/sensors-and-actors.md) this
// SENSES only: it reads the worktree's capability signals (the .github/workflows
// filenames + a fingerprint of the checkable static claims) and files ONE `drift`
// issue stating that a weekly freshness sweep is warranted. It NEVER edits files,
// calls the LLM, or opens a PR — the drift ACTOR (drift-actor.yml) does that. The
// two share only the `drift` label + marker schema; neither imports the other.
//
//   gather (scripts/freshness/gather.mjs writes state.json — reads the worktree,
//     no secret needed for local reads) → THIS sensor reads state.json and files
//     a deduped `drift` issue carrying a compact capability fingerprint:
//       <!-- drift:{"workflows":[…],"claimCount":N,"sensed":"<iso>"} -->
//
// The actor RE-GATHERS fresh state at its own run time (the worktree is the source
// of truth then), so we deliberately do NOT carry the heavy full state (note
// bodies) in the marker — only the fingerprint that justified queuing the sweep.
//
// DEDUP: one open `drift` at a time — if the actor hasn't consumed the last sweep
// request yet, don't stack another. By-existence dedup over the open queue.
//
// Graceful: absent/empty state → no-op (exit 0). No GitHub token → no-op. A
// missing label is created (ensureLabel) so a fresh repo never errors (#55).
//
// Input:  argv[2] state.json (default ./state.json)
// Effect: opens at most one `drift` issue.

import { existsSync, readFileSync } from "node:fs";
import { emitIssue, ensureLabel, listOpenIssues } from "../lib/issues.mjs";

const STATE_PATH = process.argv[2] ?? "state.json";
const LABEL = "drift";

if (!existsSync(STATE_PATH)) {
  console.log(`sense: ${STATE_PATH} absent (gather skipped) — skipping (graceful no-op).`);
  process.exit(0);
}

const state = JSON.parse(readFileSync(STATE_PATH, "utf8"));
const workflows = Array.isArray(state?.workflows) ? state.workflows : [];
const siteClaims = state?.siteClaims ?? {};
// A compact count of the checkable static claims — enough to fingerprint the
// site's copy surface without carrying it. (titles + texts + statuses.)
const claimCount =
  (Array.isArray(siteClaims.titles) ? siteClaims.titles.length : 0) +
  (Array.isArray(siteClaims.benefitsText) ? siteClaims.benefitsText.length : 0) +
  (Array.isArray(siteClaims.statuses) ? siteClaims.statuses.length : 0);

if (workflows.length === 0 && claimCount === 0) {
  // Nothing readable in the worktree (empty/corrupt state) — nothing to sweep.
  console.log("sense: no capability signals or claims in state — nothing to queue (no-op).");
  process.exit(0);
}

// Ensure the label exists up front so a missing label never errors (#55).
ensureLabel(LABEL, "D93F0B", "A weekly site-freshness drift sweep is warranted (drift sensor → actor)");

// DEDUP — one open drift request at a time.
const open = listOpenIssues(LABEL);
if (open.length > 0) {
  console.log(
    `sense: ${open.length} open ${LABEL} issue(s) already pending (#${open
      .map((i) => i.number)
      .join(", #")}) — not emitting another (no-op).`
  );
  process.exit(0);
}

const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10); // SGT
const title = `Drift sweep — weekly site-freshness check (${today})`;
const body = [
  "A weekly site-freshness drift sweep is warranted: the worktree's capability",
  "signals (CI workflow filenames) and the checkable static claims should be",
  "re-checked against the farm's actual current capabilities.",
  "",
  `**Capability signals:** ${workflows.length} workflow file(s).`,
  `**Checkable static claims:** ${claimCount}.`,
  "",
  "The **drift actor** will consume this issue: it RE-GATHERS fresh worktree state,",
  "runs `scripts/freshness/draft.mjs` (one OpenAI call — a bounded patch: copyEdits",
  "for stale static copy + APPEND-ONLY addenda for drifted notes) then",
  "`scripts/freshness/validate.mjs` (the gate — byte-for-byte preservation of",
  "original note prose), and opens an `auto-land` PR. This issue closes when that",
  "PR merges; if there is no genuine drift, the sweep no-ops and the issue is",
  "released for a later retry.",
].join("\n");

const num = emitIssue({
  label: LABEL,
  title,
  body,
  data: {
    workflows,
    claimCount,
    sensed: new Date().toISOString(),
  },
});

if (num) {
  console.log(`sense: opened ${LABEL} issue #${num} (${workflows.length} workflows, ${claimCount} claims).`);
} else {
  console.log("sense: no issue opened (no token, or create failed) — graceful no-op.");
}
