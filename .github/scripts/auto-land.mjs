// Auto-land sweeper: enumerate open PRs and merge the ones that are eligible.
// Dry-run unless AUTOLAND_LIVE === "true". See auto-land.yml for the full rationale.
//
// Eligibility (ALL must hold):
//   - has label `auto-land`
//   - NOT draft
//   - NOT label `hold` and NOT label `no-auto-land`
//   - no `STOP` comment from an OWNER/MEMBER/COLLABORATOR after the latest commit
//   - mergeable == "MERGEABLE"
//   - every REQUIRED context is SUCCESS in statusCheckRollup:
//       "Type-check & build", "Link check", "claude-review/clear"
//     (advisory "Lighthouse (advisory)" is ignored — an UNSTABLE rollup caused
//      only by it must still be allowed)
//
// Reads use GH_TOKEN (GITHUB_TOKEN). The MERGE uses AUTOLAND_PAT so downstream
// push/workflow_run jobs (deploy.yml) fire.

import { execFileSync } from "node:child_process";

const { GH_TOKEN, AUTOLAND_PAT, AUTOLAND_LIVE } = process.env;
const LIVE = AUTOLAND_LIVE === "true";
// GITHUB_REPOSITORY ("owner/repo") is always set by Actions on every event type,
// including `schedule` where github.event.repository is absent. Prefer it.
const REPO_SLUG = process.env.GITHUB_REPOSITORY || `${process.env.OWNER}/${process.env.REPO}`;

const REQUIRED_CONTEXTS = ["Type-check & build", "Link check", "claude-review/clear"];
const TRUSTED_ASSOC = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

function gh(args, { token = GH_TOKEN } = {}) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    env: { ...process.env, GH_TOKEN: token },
  });
}

function ghJson(args) {
  return JSON.parse(gh(args));
}

function log(msg) {
  console.log(msg);
}

// --- rollup evaluation -----------------------------------------------------

// statusCheckRollup entries are a union of CheckRun and StatusContext shapes.
// Normalize each to { name, ok } where ok means "succeeded".
function rollupResult(node) {
  // CheckRun: has __typename "CheckRun", status, conclusion, name
  if (node.__typename === "CheckRun" || node.status !== undefined) {
    const name = node.name;
    const completed = node.status === "COMPLETED";
    const conclusion = (node.conclusion || "").toUpperCase();
    return { name, ok: completed && (conclusion === "SUCCESS" || conclusion === "NEUTRAL") };
  }
  // StatusContext: has context, state
  const name = node.context;
  const state = (node.state || "").toUpperCase();
  return { name, ok: state === "SUCCESS" };
}

function requiredContextsGreen(rollup) {
  const byName = new Map();
  for (const node of rollup || []) {
    const { name, ok } = rollupResult(node);
    if (!name) continue;
    // If a context appears multiple times (re-runs), the latest GraphQL entry
    // wins; gh returns the current set, so last-write is fine.
    byName.set(name, ok);
  }
  const missing = [];
  for (const ctx of REQUIRED_CONTEXTS) {
    if (byName.get(ctx) !== true) missing.push(ctx);
  }
  return { ok: missing.length === 0, missing };
}

// --- STOP comment check ----------------------------------------------------

function hasTrustedStop(pr) {
  // A STOP comment from a trusted author after the latest commit halts landing.
  // We compare timestamps: any qualifying comment newer than the last commit.
  let comments = [];
  let commits = [];
  try {
    const data = ghJson([
      "pr",
      "view",
      String(pr.number),
      "--repo",
      REPO_SLUG,
      "--json",
      "comments,commits",
    ]);
    comments = data.comments || [];
    commits = data.commits || [];
  } catch (err) {
    // If we can't determine, be safe: treat as a stop (don't land).
    log(`#${pr.number}: could not load comments/commits (${err.message}); treating as STOP.`);
    return true;
  }
  const lastCommitAt = commits
    .map((c) => new Date(c.committedDate || c.authoredDate || 0).getTime())
    .reduce((a, b) => Math.max(a, b), 0);

  for (const c of comments) {
    const body = (c.body || "").trim();
    if (!/\bSTOP\b/.test(body)) continue;
    const assoc = (c.authorAssociation || "").toUpperCase();
    if (!TRUSTED_ASSOC.has(assoc)) continue;
    const at = new Date(c.createdAt || 0).getTime();
    if (at >= lastCommitAt) return true;
  }
  return false;
}

// --- main ------------------------------------------------------------------

if (!AUTOLAND_PAT && LIVE) {
  log("AUTOLAND_LIVE is true but AUTOLAND_PAT is not set — cannot merge. No-op (nothing landed).");
  process.exit(0);
}

log(`Auto-land sweep on ${REPO_SLUG} — mode: ${LIVE ? "LIVE" : "DRY-RUN"}`);

let prs = [];
try {
  prs = ghJson([
    "pr",
    "list",
    "--repo",
    REPO_SLUG,
    "--state",
    "open",
    "--limit",
    "50",
    "--json",
    "number,labels,isDraft,mergeable,mergeStateStatus,statusCheckRollup,headRefName,url",
  ]);
} catch (err) {
  log(`Failed to list PRs: ${err.message}`);
  process.exit(1);
}

if (prs.length === 0) {
  log("No open PRs.");
  process.exit(0);
}

let landed = 0;
for (const pr of prs) {
  const labels = new Set((pr.labels || []).map((l) => l.name));
  const tag = `#${pr.number} (${pr.headRefName})`;

  if (!labels.has("auto-land")) {
    continue; // not opted in; silent
  }
  if (pr.isDraft) {
    log(`${tag}: skip — draft.`);
    continue;
  }
  if (labels.has("hold") || labels.has("no-auto-land")) {
    log(`${tag}: skip — has hold/no-auto-land label.`);
    continue;
  }
  if (pr.mergeable !== "MERGEABLE") {
    log(`${tag}: skip — mergeable=${pr.mergeable} (needs MERGEABLE; e.g. conflicts).`);
    continue;
  }

  const { ok, missing } = requiredContextsGreen(pr.statusCheckRollup);
  if (!ok) {
    log(`${tag}: skip — required checks not all green; pending/failing: ${missing.join(", ")}.`);
    continue;
  }

  if (hasTrustedStop(pr)) {
    log(`${tag}: skip — trusted STOP comment after latest commit.`);
    continue;
  }

  // Eligible.
  if (!LIVE) {
    log(`${tag}: ELIGIBLE — would land #${pr.number} (dry-run; AUTOLAND_LIVE != "true").`);
    continue;
  }

  try {
    gh(["pr", "merge", String(pr.number), "--repo", REPO_SLUG, "--squash", "--delete-branch"], {
      token: AUTOLAND_PAT,
    });
    // Comment with the default token (PAT also works; either is fine).
    try {
      gh([
        "pr",
        "comment",
        String(pr.number),
        "--repo",
        REPO_SLUG,
        "--body",
        "auto-landed: checks green, review clear.",
      ]);
    } catch {
      /* comment is best-effort */
    }
    log(`${tag}: LANDED (squash + delete-branch).`);
    landed += 1;
  } catch (err) {
    log(`${tag}: merge FAILED — ${err.message}`);
  }
}

log(`Sweep done. ${LIVE ? `Landed ${landed} PR(s).` : "Dry-run — nothing merged."}`);
