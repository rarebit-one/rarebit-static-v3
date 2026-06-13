// Farm-feed pipeline · step 1 of 3 — GATHER (deterministic, no LLM).
//
// Reads yesterday's GitHub Actions workflow runs across rarebit-one's PRIVATE
// repos and reduces them to a sanitized aggregate: category + count +
// timestamp + outcome only. Repo names, branches, commit messages, actors,
// and URLs are read here and NEVER written to the output — this is the strip
// half of the "digest sandwich". The LLM (step 2) only ever sees this file.
//
// Also emits a `blocklist` (private repo names + org member logins + the
// actor/commit-author logins seen in the private run data) that the validator
// (step 3) uses to hard-fail if any of them leak into the phrased output.
// Repos, members, and per-repo runs are all fully paginated so identifiers
// past page 1 still reach the blocklist; org members stays best-effort (a
// metadata-only PAT may 403/empty), with run actors as the fallback source.
//
// Env: FEED_GITHUB_PAT (fine-grained, read-only Actions + metadata on
// rarebit-one private repos). Missing token → exit 0 with a notice so the
// workflow no-ops gracefully until secrets are wired up.
//
// Output: writes sanitized.json to the path in argv[2] (default ./sanitized.json).

import { writeFileSync } from "node:fs";

const ORG = "rarebit-one";
const TOKEN = process.env.FEED_GITHUB_PAT;
const OUT = process.argv[2] ?? "sanitized.json";
const MAX_EVENTS = 40;
const MAX_PAGES = 50; // safety cap: ~5k items/list — far beyond the org's real size
const TZ_OFFSET = "+08:00"; // SGT — the farm runs on Singapore time

if (!TOKEN) {
  console.log("gather: FEED_GITHUB_PAT not set — skipping (graceful no-op).");
  process.exit(0);
}

// Yesterday's 00:00:00–23:59:59 in SGT, expressed as UTC instants for the API.
function yesterdayWindow() {
  const now = new Date();
  const sgtNow = new Date(now.getTime() + 8 * 3600_000);
  const y = new Date(sgtNow);
  y.setUTCDate(y.getUTCDate() - 1);
  const date = y.toISOString().slice(0, 10); // YYYY-MM-DD (SGT calendar day)
  return {
    date,
    startUtc: new Date(`${date}T00:00:00${TZ_OFFSET}`),
    endUtc: new Date(`${date}T23:59:59${TZ_OFFSET}`),
  };
}

// Single fetch against the GitHub API. Returns the raw Response so callers can
// read the Link header for pagination; `fetchAllPages` checks `.ok`.
async function ghRaw(path) {
  return fetch(path.startsWith("http") ? path : `https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "rarebit-farm-feed",
    },
  });
}

// Parse the rel="next" URL out of a GitHub Link header, if present.
function nextLink(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

// Fetch ALL pages of a paginated list endpoint, following the Link rel="next"
// header. `path` should already carry per_page (=100). Stops at MAX_PAGES as a
// safety cap; logs a warning (with `label`) if the cap is hit so we never
// silently assume full coverage. `pick` extracts the array from each page's
// body (GitHub returns a bare array for repos/members, an object with
// `workflow_runs` for runs). Throws on a non-OK page (callers may .catch()).
async function fetchAllPages(path, { label, pick = (b) => b } = {}) {
  const items = [];
  let url = path;
  let page = 0;
  while (url) {
    if (page >= MAX_PAGES) {
      console.log(`gather: WARNING ${label ?? path} hit page cap (${MAX_PAGES}) — list may be truncated`);
      break;
    }
    const response = await ghRaw(url);
    if (!response.ok) throw new Error(`GitHub ${url} → ${response.status}`);
    const body = await response.json();
    const chunk = pick(body);
    if (Array.isArray(chunk)) items.push(...chunk);
    url = nextLink(response.headers.get("link"));
    page += 1;
  }
  return items;
}

// Workflow-name → category. Done HERE so names never leave this script.
function categorize(name) {
  const n = name.toLowerCase();
  if (/(deploy|release|publish|ship|promote)/.test(n)) return "deploy";
  if (/(test|spec|rspec|vitest|jest|e2e)/.test(n)) return "tests";
  if (/(lint|typecheck|check|ci|build)/.test(n)) return "ci";
  if (/(maintenance|weekly|cron|schedule|nightly|sweep)/.test(n)) return "scheduled job";
  if (/(review|claude|audit)/.test(n)) return "review cycle";
  if (/(data|migrate|reconcile|sync|import|export|report)/.test(n)) return "data pipeline";
  return "job";
}

async function main() {
  const { date, startUtc, endUtc } = yesterdayWindow();

  // Repos + members: fully paginated so identifiers past page 1 still reach the
  // blocklist. Members stays best-effort (a metadata-only PAT may 403/empty) —
  // so it is NO LONGER the sole source of logins (see actorLogins below).
  const repos = await fetchAllPages(`/orgs/${ORG}/repos?type=private&per_page=100`, { label: "repos" });
  const members = await fetchAllPages(`/orgs/${ORG}/members?per_page=100`, { label: "members" }).catch(() => []);

  if (!Array.isArray(members) || members.length === 0) {
    console.log("gather: note — no org members fetched (PAT scope?); deriving logins from run actors instead");
  }

  // Logins seen as workflow actors / triggering commit authors in the private
  // run data we already fetch. This backfills the blocklist when /members is
  // empty, and catches outside collaborators who aren't org members. These are
  // read HERE and never written downstream — only the blocklist (used locally
  // by validate) carries them, and only totals/events leave for the LLM.
  const actorLogins = new Set();

  const created = `${date}T00:00:00${TZ_OFFSET}..${date}T23:59:59${TZ_OFFSET}`;
  const raw = [];
  for (const repo of repos) {
    const runs = await fetchAllPages(
      `/repos/${repo.full_name}/actions/runs?created=${encodeURIComponent(created)}&per_page=100`,
      { label: `runs:${repo.full_name}`, pick: (b) => b?.workflow_runs ?? [] }
    ).catch(() => []);
    for (const run of runs) {
      for (const login of [run.actor?.login, run.triggering_actor?.login, run.head_commit?.author?.name]) {
        if (login) actorLogins.add(String(login));
      }
      const at = new Date(run.run_started_at ?? run.created_at);
      if (at < startUtc || at > endUtc) continue;
      if (run.status !== "completed") continue;
      raw.push({
        at: at.toISOString(),
        category: categorize(run.name ?? run.display_title ?? ""),
        ok: run.conclusion === "success",
      });
    }
  }

  // Defense-in-depth blocklist: private repo names + org member logins + the
  // actor/author logins derived above. The validator still gates URLs / emails /
  // @handles / fabricated numbers independently; this just widens coverage.
  const blocklist = [
    ...new Set([
      ...repos.map((r) => r.name),
      ...repos.map((r) => r.full_name),
      ...(Array.isArray(members) ? members.map((m) => m.login) : []),
      ...actorLogins,
    ]),
  ];

  raw.sort((a, b) => a.at.localeCompare(b.at));

  // Aggregate same-category runs within the same clock hour into one event
  // with a count, so a burst reads as "test suite ×6" not six rows.
  const buckets = new Map();
  for (const event of raw) {
    const key = `${event.at.slice(0, 13)}|${event.category}|${event.ok}`;
    const existing = buckets.get(key);
    if (existing) existing.count += 1;
    else buckets.set(key, { at: event.at, category: event.category, ok: event.ok, count: 1 });
  }
  let events = [...buckets.values()];

  // Cap to MAX_EVENTS, sampled for category diversity (round-robin across
  // categories) so one noisy category can't crowd out the rest.
  if (events.length > MAX_EVENTS) {
    const byCat = new Map();
    for (const e of events) {
      if (!byCat.has(e.category)) byCat.set(e.category, []);
      byCat.get(e.category).push(e);
    }
    const lanes = [...byCat.values()];
    const sampled = [];
    let i = 0;
    while (sampled.length < MAX_EVENTS && lanes.some((l) => l.length)) {
      const lane = lanes[i % lanes.length];
      if (lane.length) sampled.push(lane.shift());
      i += 1;
    }
    sampled.sort((a, b) => a.at.localeCompare(b.at));
    events = sampled;
  }

  const tally = events.reduce((sum, e) => sum + e.count, 0);
  const greenPct = tally ? Math.round((events.filter((e) => e.ok).reduce((s, e) => s + e.count, 0) / tally) * 100) : 100;
  const categories = [...new Set(events.map((e) => e.category))];

  const sanitized = {
    window: date,
    totals: { runs: tally, systems: repos.length, greenPct },
    categories,
    events,
    blocklist,
  };

  writeFileSync(OUT, JSON.stringify(sanitized, null, 2));
  console.log(`gather: ${tally} runs across ${repos.length} private systems → ${events.length} events (${OUT})`);
}

main().catch((error) => {
  console.error(`gather: ${error.message}`);
  process.exit(1);
});
