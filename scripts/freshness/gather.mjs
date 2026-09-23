// Site-freshness pipeline · step 1 of 3 — GATHER (deterministic, no LLM).
//
// Phase 5 of the autonomy program (issue #33). The weekly drift sweep that
// keeps the public site honest as the farm's real capabilities change. This
// step assembles `state.json` — the ground truth the drafter (step 2) is
// grounded in — by reading the worktree at runtime:
//
//   - workflows: the .github/workflows/*.yml filenames. These are capability
//     SIGNALS: e.g. an `auto-land.yml` present ⇒ gated auto-land exists, which
//     is exactly the kind of fact that makes "humans approve the merge" copy
//     stale.
//   - pages: the page inventory from src/pages/ (used by the validator to
//     reject dead internal links in any proposed addendum).
//   - siteClaims: the checkable static copy from src/data/site.ts — the
//     benefits text, roadmap titles+statuses, and collaboration blurbs, each
//     kept verbatim as written in the file.
//   - siteSource: the full, verbatim text of src/data/site.ts. Every copyEdit
//     `find` must be copied from it character for character (#610).
//   - notes: every field note (slug, frontmatter, FULL body). The drafter may
//     propose an APPENDED addendum for a drifted note; the validator preserves
//     the original body byte-for-byte.
//
// Live facts (merged-PR count etc.) are SECONDARY — the site already
// self-reports — and only pulled if a token is present. Their absence never
// fails the run; this whole step is best-effort and local-first.
//
// No secret is required for the local reads. FEED_GITHUB_PAT (or GITHUB_TOKEN)
// is used only for the optional live facts; missing → those fields are omitted.
//
// Output: writes state.json to argv[2] (default ./state.json).

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ORG = "rarebit-one";
const TOKEN = process.env.FEED_GITHUB_PAT || process.env.GITHUB_TOKEN;
const OUT = process.argv[2] ?? "state.json";

// --- WORKFLOWS — capability signals ----------------------------------------
function readWorkflows() {
  const dir = ".github/workflows";
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .sort();
}

// --- PAGES — inventory for dead-link checks --------------------------------
// Collect routable page paths from src/pages. Astro maps `index.astro` → "/",
// `foo.astro` → "/foo", and a directory of content (field-notes) is handled via
// the notes list. We surface both the bare slugs and "/"-rooted paths.
function readPages() {
  const dir = "src/pages";
  if (!existsSync(dir)) return [];
  const pages = [];
  const walk = (d, prefix) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(`${d}/${entry.name}`, `${prefix}${entry.name}/`);
        continue;
      }
      const name = entry.name;
      // Page files Astro routes from.
      if (!/\.(astro|md|mdx|html|js|ts)$/.test(name)) continue;
      const base = name.replace(/\.(astro|md|mdx|html|js|ts)$/, "");
      // rss.xml.js → /rss.xml; index → directory root.
      if (base === "index") {
        pages.push(prefix === "" ? "/" : `/${prefix}`.replace(/\/$/, "/"));
      } else {
        pages.push(`/${prefix}${base}`);
      }
    }
  };
  walk(dir, "");
  return [...new Set(pages)].sort();
}

// --- SITE CLAIMS — checkable static copy from src/data/site.ts -------------
// We do NOT evaluate the TS; we read it as text and pull the human-facing
// strings the drafter may need to correct. Each literal is kept EXACTLY as it
// appears between the quotes in the file (escapes are NOT decoded), so any of
// them is a valid verbatim `find` for validate.mjs.
export const SITE_FILE = "src/data/site.ts";

/** Pure: pull the `title:` / `text:` / `description:` / `status:` / `date:`
 *  string literals out of site.ts source, verbatim. */
export function extractSiteClaims(src) {
  const grab = (key) => {
    const out = [];
    const re = new RegExp(`\\b${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "g");
    let m;
    while ((m = re.exec(src))) out.push(m[1]);
    return out;
  };

  return {
    benefitsText: grab("text"),
    titles: grab("title"),
    descriptions: grab("description"),
    statuses: grab("status"),
    dates: grab("date"),
  };
}

function readSiteClaims() {
  if (!existsSync(SITE_FILE)) return {};
  return extractSiteClaims(readFileSync(SITE_FILE, "utf8"));
}

// --- SITE SOURCE — the exact text the drafter may edit (#610) ---------------
// The drafter used to see only the extracted literals and occasionally
// paraphrased them into a `find` that isn't in the file. Handing it the file
// verbatim lets it copy `find` character for character; validate.mjs still
// re-checks every `find` against the file on disk.
function readSiteSource() {
  if (!existsSync(SITE_FILE)) return undefined;
  return { file: SITE_FILE, text: readFileSync(SITE_FILE, "utf8") };
}

// --- NOTES — slug + frontmatter + FULL body --------------------------------
function readNotes() {
  const candidates = ["src/content/field-notes", "src/content/notes"];
  const dir = candidates.find((d) => existsSync(d));
  if (!dir) return [];
  const notes = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;
    const raw = readFileSync(`${dir}/${file}`, "utf8");
    const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) continue;
    const front = {};
    for (const line of match[1].split("\n")) {
      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (!kv) continue;
      front[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
    }
    notes.push({
      slug: file.replace(/\.md$/, ""),
      title: front.title ?? "",
      description: front.description ?? "",
      pubDate: front.pubDate ?? "",
      body: match[2], // FULL body, verbatim — the byte-for-byte source of truth.
    });
  }
  return notes.sort((a, b) => a.slug.localeCompare(b.slug));
}

// --- LIVE FACTS — optional, best-effort, secondary -------------------------
async function gh(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "rarebit-site-freshness",
    },
  });
  if (!response.ok) throw new Error(`GitHub ${path} → ${response.status}`);
  return response.json();
}

async function liveFacts() {
  if (!TOKEN) return undefined;
  try {
    const search = await gh(
      `/search/issues?q=${encodeURIComponent(`is:pr is:merged org:${ORG}`)}&per_page=1`
    );
    return { mergedPrCount: search.total_count ?? null };
  } catch (error) {
    console.log(`gather: live facts unavailable (${error.message}) — continuing local-only.`);
    return undefined;
  }
}

async function main() {
  const generated = new Date().toISOString();
  const workflows = readWorkflows();
  const pages = readPages();
  const siteClaims = readSiteClaims();
  const siteSource = readSiteSource();
  const notes = readNotes();
  const live = await liveFacts();

  const state = {
    generated,
    workflows,
    pages,
    siteClaims,
    ...(siteSource ? { siteSource } : {}),
    notes,
    ...(live ? { live } : {}),
  };

  writeFileSync(OUT, JSON.stringify(state, null, 2));
  console.log(
    `gather: ${workflows.length} workflows, ${pages.length} pages, ` +
      `${notes.length} notes → ${OUT}` +
      (live ? ` (live: ${live.mergedPrCount} merged PRs)` : "")
  );
}

// Run only as a CLI, so the pure helpers above can be imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`gather: ${error.message}`);
    process.exit(1);
  });
}
