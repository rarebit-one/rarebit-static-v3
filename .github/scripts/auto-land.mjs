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
//       "Type-check & build", "Link check", "review/clear"
//     (advisory "Lighthouse (advisory)" is ignored — an UNSTABLE rollup caused
//      only by it must still be allowed)
//
// Reads use GH_TOKEN (GITHUB_TOKEN). The MERGE uses AUTOLAND_MERGE_TOKEN, which
// auto-land.yml resolves by the precedence App -> AUTOLAND_PAT -> GITHUB_TOKEN
// so downstream push/workflow_run jobs (deploy.yml) fire. AUTOLAND_TOKEN_MODE
// names the rung in use; the GITHUB_TOKEN rung is a degradation that fires no
// push event, so this script re-announces it loudly whenever it actually lands
// something under it — a degraded run must never read as a clean success.

import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const { GH_TOKEN, AUTOLAND_MERGE_TOKEN, AUTOLAND_TOKEN_MODE, AUTOLAND_LIVE } = process.env;
const LIVE = AUTOLAND_LIVE === "true";
// The workflow sets this to "GITHUB_TOKEN (degraded)" on the last-resort rung.
const DEGRADED = (AUTOLAND_TOKEN_MODE || "").startsWith("GITHUB_TOKEN");
// GITHUB_REPOSITORY ("owner/repo") is always set by Actions on every event type,
// including `schedule` where github.event.repository is absent. Prefer it.
const REPO_SLUG = process.env.GITHUB_REPOSITORY || `${process.env.OWNER}/${process.env.REPO}`;

const REQUIRED_CONTEXTS = ["Type-check & build", "Link check", "review/clear"];
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

// Append to the run summary when running under Actions; a no-op locally.
function summary(msg) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  try {
    appendFileSync(file, `${msg}\n`);
  } catch {
    /* the summary is best-effort; never fail a sweep over it */
  }
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

// A missing write credential degrades this actuator to a LOUD no-op — never a
// crash, and never a partial merge. (In practice the workflow always resolves
// at least GITHUB_TOKEN, so this only trips if the env is wired up wrong.)
if (!AUTOLAND_MERGE_TOKEN && LIVE) {
  log(
    "::warning::AUTOLAND_LIVE is true but no merge token was resolved — cannot merge. No-op (nothing landed).",
  );
  summary(
    "⚠️ **Auto-land no-op** — `AUTOLAND_LIVE` is true but no merge token was resolved, so nothing was landed.",
  );
  process.exit(0);
}

log(
  `Auto-land sweep on ${REPO_SLUG} — mode: ${LIVE ? "LIVE" : "DRY-RUN"}; merge token: ${AUTOLAND_TOKEN_MODE || "unknown"}`,
);

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

const landedPrs = [];
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
      token: AUTOLAND_MERGE_TOKEN,
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
    landedPrs.push(pr.number);
  } catch (err) {
    log(`${tag}: merge FAILED — ${err.message}`);
  }
}

const landed = landedPrs.length;
log(`Sweep done. ${LIVE ? `Landed ${landed} PR(s).` : "Dry-run — nothing merged."}`);

// Landing anything on the GITHUB_TOKEN rung means the merge fired no push
// event, so deploy.yml/sentry-release.yml did not run for it. Say so where it
// cannot be missed — the workflow already warned before the sweep, but this is
// the line that names the commits actually affected.
if (LIVE && landed > 0 && DEGRADED) {
  const list = landedPrs.map((n) => `#${n}`).join(", ");
  log(
    `::warning::Landed ${landed} PR(s) (${list}) using GITHUB_TOKEN — GitHub emits no push event for it, so deploy.yml and sentry-release.yml did NOT run for these merges. The site will not deploy until someone pushes to main or re-runs the deploy manually.`,
  );
  summary(
    `⚠️ **Landed ${landed} PR(s) (${list}) on the degraded \`GITHUB_TOKEN\` rung — downstream deploys did NOT fire.** ` +
      "The merges emitted no `push` event, so `deploy.yml` and `sentry-release.yml` did not run and the site is NOT deployed for this change. Restore the App token (or `AUTOLAND_PAT`) and re-run the deploy manually.",
  );
}
