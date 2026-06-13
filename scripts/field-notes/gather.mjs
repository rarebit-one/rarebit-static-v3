// Field-notes pipeline · step 1 of 3 — GATHER (deterministic, no LLM).
//
// Collects the last 7 days (SGT calendar days) of rarebit-one activity and
// reduces it to a `facts.json` the drafter (step 2) is grounded in. The zone
// split is the whole point of the "digest sandwich":
//
//   PUBLIC zone  — public repos are public, so we keep full, linkable detail:
//     merged PR { repo, number, title, url } and published releases
//     { repo, name, tag, url }. These may be named and linked in the note.
//
//   PRIVATE zone — client work is reduced to anonymized category counts HERE,
//     inside the script, exactly like farm-feed. Private repo names, branches,
//     commit messages, and member logins are read but NEVER written to any
//     field other than `blocklist` — the drafter never sees them, and the
//     validator (step 3) hard-fails if any leak into the note.
//
// Also reads existing field notes for back-linking (`pastNotes`), and pulls
// the open idea-seed issues the daily notebook scout files (PUBLIC GitHub
// issues labeled `field-note-seed` in this repo, replacing the old private
// Spaces notebook) so the drafter can mine their `angle`/`grounding` pairs as
// OPTIONAL candidate angles. Only the seed issue number + angle + grounding
// URLs are carried into facts — and the validator (step 3) remains the sole
// gate regardless.
//
// Token: prefers FEED_GITHUB_PAT, falls back to GITHUB_TOKEN. Missing both →
// exit 0 with a notice so the workflow no-ops gracefully until secrets are
// wired up. The seed-issue fetch is best-effort: a failed listing or no open
// seeds just omits the `notebook` key — it never fails the gather.
//
// Output: writes facts.json to the path in argv[2] (default ./facts.json).

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseMarker } from "../lib/issues.mjs";

const ORG = "rarebit-one";
const TOKEN = process.env.FEED_GITHUB_PAT || process.env.GITHUB_TOKEN;
const OUT = process.argv[2] ?? "facts.json";
const TZ_OFFSET = "+08:00"; // SGT — the farm runs on Singapore time
const SEED_LABEL = "field-note-seed";
// The marker TYPE token is "seed" (NOT the label) — see scripts/notebook/publish.mjs.
const SEED_MARKER_TYPE = "seed";
const SEED_REPO = process.env.GITHUB_REPOSITORY || "rarebit-one/rarebit-static-v3";

if (!TOKEN) {
  console.log("gather: no FEED_GITHUB_PAT / GITHUB_TOKEN set — skipping (graceful no-op).");
  process.exit(0);
}

// The last 7 SGT calendar days: [from, to] inclusive, as YYYY-MM-DD. `to` is
// yesterday (today is still in progress), `from` is six days before that.
function weekWindow() {
  const now = new Date();
  const sgtNow = new Date(now.getTime() + 8 * 3600_000);
  const to = new Date(sgtNow);
  to.setUTCDate(to.getUTCDate() - 1);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 6);
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
      "User-Agent": "rarebit-field-notes",
    },
  });
  if (!response.ok) throw new Error(`GitHub ${path} → ${response.status}`);
  return response.json();
}

// --- Notebook seeds (open `field-note-seed` GitHub issues) -----------------
// The daily notebook scout (a SENSOR) files each idea-seed as a PUBLIC issue
// labeled `field-note-seed`, with a hidden round-trip marker `<!-- seed:{json} -->`
// in the body. This gather is the ACTOR's "read the queue" step: we list the OPEN
// ones (open = pending candidate) and recover the structured seed from the marker
// via the shared parseMarker contract (scripts/lib/issues.mjs) — the SAME marker
// schema the publisher writes — falling back to the title as the angle plus any
// URLs scraped from the body. We fetch over the REST API here (not the `gh` CLI
// that listOpenIssues uses) because this script already runs token-authed fetch;
// only the marker parsing is shared, which is what makes the round-trip reliable.
// Best-effort: a failed listing or no open seeds returns null and the gather
// proceeds without seeds. Carries the issue number so the draft step can report
// which seeds it used (to close them).
async function fetchNotebookSeeds() {
  let issues;
  try {
    issues = await gh(
      `/repos/${SEED_REPO}/issues?labels=${encodeURIComponent(SEED_LABEL)}&state=open&per_page=100`
    );
  } catch (error) {
    console.log(`gather: seed-issue listing failed (${error.message}) — proceeding without seeds.`);
    return null;
  }
  if (!Array.isArray(issues)) return null;

  // The listing is capped at per_page=100 (no pagination). Beyond that, older
  // open seed issues fall off the page and are silently invisible to the
  // drafter. Warn loudly so it's visible; full pagination is tracked separately.
  if (issues.length >= 100) {
    console.log(
      "::warning::gather: hit the 100-issue seed cap — open seeds beyond 100 are not read. Triage/close stale seeds or add pagination."
    );
  }

  const seeds = [];
  for (const issue of issues) {
    // The issues endpoint also returns PRs; skip those.
    if (issue?.pull_request) continue;
    const body = String(issue?.body ?? "");
    const marker = parseMarker(body, SEED_MARKER_TYPE);
    let angle = "";
    let grounding = [];
    if (marker) {
      const seed = marker.data;
      if (typeof seed?.angle === "string") angle = seed.angle.trim();
      grounding = (Array.isArray(seed?.grounding) ? seed.grounding : []).filter(
        (u) => typeof u === "string"
      );
    }
    if (!angle) angle = String(issue?.title ?? "").trim();
    if (!grounding.length) {
      grounding = (body.match(/https?:\/\/[^\s)\]<>"']+/gi) ?? []).map((u) =>
        u.replace(/[.,;:]+$/, "")
      );
    }
    if (!angle) continue;
    seeds.push({ issue: issue.number, angle, grounding });
  }
  return seeds;
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

// Read existing field notes for back-linking. Prefer the new /field-notes
// directory; fall back to the legacy /notes directory if the rename PR hasn't
// landed yet. Frontmatter is a simple YAML head — parse only the three fields
// the schema defines (title, description, pubDate); slug is the filename.
function readPastNotes() {
  const candidates = ["src/content/field-notes", "src/content/notes"];
  const dir = candidates.find((d) => existsSync(d));
  if (!dir) return [];
  const notes = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;
    const raw = readFileSync(`${dir}/${file}`, "utf8");
    const match = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!match) continue;
    const front = {};
    for (const line of match[1].split("\n")) {
      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (!kv) continue;
      front[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
    }
    notes.push({
      title: front.title ?? "",
      slug: file.replace(/\.md$/, ""),
      pubDate: front.pubDate ?? "",
      description: front.description ?? "",
    });
  }
  return notes;
}

async function main() {
  const { from, to, startUtc, endUtc } = weekWindow();

  // --- PUBLIC zone — full, linkable detail ---------------------------------
  const publicRepos = await gh(`/orgs/${ORG}/repos?type=public&per_page=100`);
  const publicNames = new Set(publicRepos.map((r) => r.name));
  const publicFullNames = new Set(publicRepos.map((r) => r.full_name));

  // Merged PRs in the window via the search API, then keep only public repos.
  const prSearch = await gh(
    `/search/issues?q=${encodeURIComponent(
      `is:pr is:merged org:${ORG} merged:${from}..${to}`
    )}&per_page=100`
  ).catch(() => ({ items: [] }));
  const prs = [];
  for (const item of prSearch.items ?? []) {
    // repository_url is .../repos/{org}/{repo}; derive full_name to gate on public.
    const fullName = (item.repository_url ?? "").split("/repos/")[1] ?? "";
    if (!publicFullNames.has(fullName)) continue;
    prs.push({
      repo: fullName.split("/")[1],
      number: item.number,
      title: item.title,
      url: item.html_url,
    });
  }

  // Published releases in the window, per public repo.
  const releases = [];
  for (const repo of publicRepos) {
    const data = await gh(`/repos/${repo.full_name}/releases?per_page=100`).catch(() => null);
    if (!Array.isArray(data)) continue;
    for (const rel of data) {
      if (rel.draft || !rel.published_at) continue;
      const at = new Date(rel.published_at);
      if (at < startUtc || at > endUtc) continue;
      releases.push({
        repo: repo.name,
        name: rel.name || rel.tag_name,
        tag: rel.tag_name,
        url: rel.html_url,
      });
    }
  }

  // --- PRIVATE zone — anonymized aggregate ONLY ----------------------------
  const privateRepos = await gh(`/orgs/${ORG}/repos?type=private&per_page=100`);
  const members = await gh(`/orgs/${ORG}/members?per_page=100`).catch(() => []);

  // Defense-in-depth blocklist. The drafter never sees raw names, but the
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

  // OPTIONAL idea-seeds from the open `field-note-seed` issues (best-effort;
  // null if the listing fails). { issue, angle, grounding } — candidate angles
  // for the drafter, NOT facts to assert; the validator still gates URLs. The
  // issue number lets the workflow close seeds the draft actually used.
  const notebookSeeds = await fetchNotebookSeeds();

  const facts = {
    window: { from, to },
    public: {
      prs,
      releases,
      repos: [...publicNames],
    },
    private: {
      totals: { runs, systems: privateRepos.length, greenPct },
      categories,
      events,
      blocklist,
    },
    pastNotes: readPastNotes(),
    ...(notebookSeeds && notebookSeeds.length ? { notebook: notebookSeeds } : {}),
  };

  writeFileSync(OUT, JSON.stringify(facts, null, 2));
  console.log(
    `gather: ${prs.length} public PRs, ${releases.length} releases, ` +
      `${runs} private runs across ${privateRepos.length} systems` +
      `${notebookSeeds ? `, ${notebookSeeds.length} notebook seeds` : ""} → ${OUT}`
  );
}

main().catch((error) => {
  console.error(`gather: ${error.message}`);
  process.exit(1);
});
