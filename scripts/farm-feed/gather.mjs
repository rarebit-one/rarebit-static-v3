// Farm-feed pipeline · step 1 of 3 — GATHER (deterministic, no LLM).
//
// Reads yesterday's GitHub Actions workflow runs across rarebit-one's PRIVATE
// repos and reduces them to a sanitized aggregate: category + count +
// timestamp + outcome only. Repo names, branches, commit messages, actors,
// and URLs are read here and NEVER written to the output — this is the strip
// half of the "digest sandwich". The LLM (step 2) only ever sees this file.
//
// Also emits a `blocklist` (private repo names + org member logins) that the
// validator (step 3) uses to hard-fail if any of them leak into the phrased
// output.
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

async function gh(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "rarebit-farm-feed",
    },
  });
  if (!response.ok) throw new Error(`GitHub ${path} → ${response.status}`);
  return response.json();
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
  const repos = await gh(`/orgs/${ORG}/repos?type=private&per_page=100`);
  const members = await gh(`/orgs/${ORG}/members?per_page=100`).catch(() => []);

  const blocklist = [
    ...repos.map((r) => r.name),
    ...repos.map((r) => r.full_name),
    ...(Array.isArray(members) ? members.map((m) => m.login) : []),
  ];

  const created = `${date}T00:00:00${TZ_OFFSET}..${date}T23:59:59${TZ_OFFSET}`;
  const raw = [];
  for (const repo of repos) {
    const data = await gh(
      `/repos/${repo.full_name}/actions/runs?created=${encodeURIComponent(created)}&per_page=100`
    ).catch(() => null);
    if (!data?.workflow_runs) continue;
    for (const run of data.workflow_runs) {
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
