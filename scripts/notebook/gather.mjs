// Notebook pipeline · step 1 of 3 — GATHER (deterministic, no LLM).
//
// The daily "interesting-work scout". It accumulates anonymized idea-seeds
// into a rolling notebook the weekly Field Note later mines. This is the strip
// half of the same "digest sandwich" the farm-feed and field-notes pipelines
// use — the sanitization spine is reused verbatim, not reinvented.
//
//   PUBLIC zone  — public repos are public, so we keep full, linkable detail:
//     recently merged PRs { repo, kind:"pr", title, url, mergedAt }, published
//     releases { repo, kind:"release", title, url, date }, and notable commits
//     { repo, kind:"commit", title, url, date } (substantial messages or many
//     files touched). These may be named and linked in a future note.
//
//   PRIVATE zone — client work is reduced to anonymized category counts HERE,
//     inside the script, exactly like farm-feed. Private repo names, branches,
//     commit messages, and member logins are read but NEVER written to any
//     field other than `blocklist` — the curator (step 2) never sees them, and
//     the validator (step 3) hard-fails if any leak into a seed.
//
// Token: prefers FEED_GITHUB_PAT, falls back to GITHUB_TOKEN. Missing both →
// exit 0 with a notice so the workflow no-ops gracefully until secrets are
// wired up.
//
// Output: writes notebook-raw.json to the path in argv[2] (default
// ./notebook-raw.json):
//   { window, public:[...items], private:{categories,events,totals}, blocklist }

import { writeFileSync } from "node:fs";

const ORG = "rarebit-one";
const TOKEN = process.env.FEED_GITHUB_PAT || process.env.GITHUB_TOKEN;
const OUT = process.argv[2] ?? "notebook-raw.json";
const TZ_OFFSET = "+08:00"; // SGT — the farm runs on Singapore time
const LOOKBACK_DAYS = 2; // recent activity: yesterday + today-so-far (SGT)
const MAX_PUBLIC = 24; // cap public items carried into the curate prompt
const NOTABLE_FILES = 4; // a commit touching >= this many files is "notable"
const NOTABLE_MSG_LEN = 80; // ...or one with a substantial message body

if (!TOKEN) {
  console.log("gather: no FEED_GITHUB_PAT / GITHUB_TOKEN set — skipping (graceful no-op).");
  process.exit(0);
}

// The recent SGT window: [from, to] inclusive as YYYY-MM-DD. `to` is today
// (SGT), `from` is LOOKBACK_DAYS-1 days before. We scout fresh activity daily;
// the 14-day retention lives in the validator (notebook merge), not here.
function recentWindow() {
  const now = new Date();
  const sgtNow = new Date(now.getTime() + 8 * 3600_000);
  const to = new Date(sgtNow);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (LOOKBACK_DAYS - 1));
  const fromDate = from.toISOString().slice(0, 10);
  const toDate = to.toISOString().slice(0, 10);
  return {
    from: fromDate,
    to: toDate,
    startUtc: new Date(`${fromDate}T00:00:00${TZ_OFFSET}`),
    endUtc: new Date(`${toDate}T23:59:59${TZ_OFFSET}`),
  };
}

async function gh(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "rarebit-notebook",
    },
  });
  if (!response.ok) throw new Error(`GitHub ${path} → ${response.status}`);
  return response.json();
}

// Workflow-name → category. Copied verbatim from farm-feed/gather.mjs so the
// private aggregate categorizes identically. Done HERE so names never leave.
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
  const { from, to, startUtc, endUtc } = recentWindow();

  // --- PUBLIC zone — full, linkable detail ---------------------------------
  const publicRepos = await gh(`/orgs/${ORG}/repos?type=public&per_page=100`);
  const publicFullNames = new Set(publicRepos.map((r) => r.full_name));
  const publicItems = [];

  // Merged PRs in the window via the search API, then keep only public repos.
  const prSearch = await gh(
    `/search/issues?q=${encodeURIComponent(
      `is:pr is:merged org:${ORG} merged:${from}..${to}`
    )}&per_page=100`
  ).catch(() => ({ items: [] }));
  for (const item of prSearch.items ?? []) {
    const fullName = (item.repository_url ?? "").split("/repos/")[1] ?? "";
    if (!publicFullNames.has(fullName)) continue;
    publicItems.push({
      repo: fullName.split("/")[1],
      kind: "pr",
      title: item.title,
      url: item.html_url,
      mergedAt: item.closed_at ?? null,
    });
  }

  // Published releases + notable commits, per public repo.
  for (const repo of publicRepos) {
    const releases = await gh(`/repos/${repo.full_name}/releases?per_page=20`).catch(() => null);
    if (Array.isArray(releases)) {
      for (const rel of releases) {
        if (rel.draft || !rel.published_at) continue;
        const at = new Date(rel.published_at);
        if (at < startUtc || at > endUtc) continue;
        publicItems.push({
          repo: repo.name,
          kind: "release",
          title: rel.name || rel.tag_name,
          url: rel.html_url,
          date: rel.published_at,
        });
      }
    }

    // Notable commits on the default branch in the window. We fetch the slim
    // list (since/until), then enrich only candidates to learn files-changed.
    const since = startUtc.toISOString();
    const until = endUtc.toISOString();
    const commits = await gh(
      `/repos/${repo.full_name}/commits?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&per_page=30`
    ).catch(() => null);
    if (!Array.isArray(commits)) continue;
    for (const c of commits) {
      const message = c.commit?.message ?? "";
      const firstLine = message.split("\n")[0];
      // Skip merge commits and bot/automation churn — not "interesting".
      if (/^merge /i.test(firstLine)) continue;
      const longMessage = message.trim().length >= NOTABLE_MSG_LEN;
      // Enrich to count files only when the message alone didn't qualify, to
      // keep API calls bounded.
      let touchesMany = false;
      if (!longMessage) {
        const detail = await gh(`/repos/${repo.full_name}/commits/${c.sha}`).catch(() => null);
        touchesMany = Array.isArray(detail?.files) && detail.files.length >= NOTABLE_FILES;
      }
      if (!longMessage && !touchesMany) continue;
      publicItems.push({
        repo: repo.name,
        kind: "commit",
        title: firstLine.slice(0, 120),
        url: c.html_url,
        date: c.commit?.author?.date ?? c.commit?.committer?.date ?? null,
      });
    }
  }

  // Cap public items, newest-first, so one busy repo can't crowd the prompt.
  const ts = (it) => it.mergedAt ?? it.date ?? "";
  publicItems.sort((a, b) => String(ts(b)).localeCompare(String(ts(a))));
  const publicCapped = publicItems.slice(0, MAX_PUBLIC);

  // --- PRIVATE zone — anonymized aggregate ONLY ----------------------------
  const privateRepos = await gh(`/orgs/${ORG}/repos?type=private&per_page=100`);
  const members = await gh(`/orgs/${ORG}/members?per_page=100`).catch(() => []);

  // The blocklist is defense-in-depth (the LLM never sees raw names anyway),
  // but flag truncation so we don't assume full coverage. >100 repos/members,
  // or an empty members list from a metadata-only PAT, means some identifiers
  // aren't on the blocklist — the validator still gates URLs/emails/handles.
  if (privateRepos.length === 100) console.log("gather: WARNING private repos hit per_page=100 — blocklist may be incomplete");
  if (Array.isArray(members) && members.length === 100) console.log("gather: WARNING members hit per_page=100 — blocklist may be incomplete");
  if (!Array.isArray(members) || members.length === 0) console.log("gather: note — no org members fetched (PAT scope?); logins absent from blocklist");

  // Defense-in-depth blocklist. The curator never sees raw names, but the
  // validator gates on these so nothing private can slip through phrasing.
  const blocklist = [
    ...privateRepos.map((r) => r.name),
    ...privateRepos.map((r) => r.full_name),
    ...(Array.isArray(members) ? members.map((m) => m.login) : []),
  ];

  const created = `${from}T00:00:00${TZ_OFFSET}..${to}T23:59:59${TZ_OFFSET}`;
  const raw = [];
  for (const repo of privateRepos) {
    const data = await gh(
      `/repos/${repo.full_name}/actions/runs?created=${encodeURIComponent(created)}&per_page=100`
    ).catch(() => null);
    if (!data?.workflow_runs) continue;
    for (const run of data.workflow_runs) {
      const at = new Date(run.run_started_at ?? run.created_at);
      if (at < startUtc || at > endUtc) continue;
      if (run.status !== "completed") continue;
      raw.push({
        category: categorize(run.name ?? run.display_title ?? ""),
        ok: run.conclusion === "success",
      });
    }
  }

  // Aggregate to category + count + ok. No timestamps, no identifiers.
  const buckets = new Map();
  for (const event of raw) {
    const key = `${event.category}|${event.ok}`;
    const existing = buckets.get(key);
    if (existing) existing.count += 1;
    else buckets.set(key, { category: event.category, ok: event.ok, count: 1 });
  }
  const events = [...buckets.values()].sort((a, b) => b.count - a.count);
  const categories = [...new Set(events.map((e) => e.category))];

  const runs = events.reduce((sum, e) => sum + e.count, 0);
  const greenRuns = events.filter((e) => e.ok).reduce((sum, e) => sum + e.count, 0);
  const greenPct = runs ? Math.round((greenRuns / runs) * 100) : 100;

  const out = {
    window: { from, to },
    public: publicCapped,
    private: {
      categories,
      events,
      totals: { runs, systems: privateRepos.length, greenPct },
    },
    blocklist,
  };

  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(
    `gather: ${publicCapped.length} public items (of ${publicItems.length}), ` +
      `${runs} private runs across ${privateRepos.length} systems → ${OUT}`
  );
}

main().catch((error) => {
  console.error(`gather: ${error.message}`);
  process.exit(1);
});
