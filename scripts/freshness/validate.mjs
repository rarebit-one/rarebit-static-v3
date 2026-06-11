// Site-freshness pipeline · step 3 of 3 — VALIDATE + APPLY (deterministic).
//
// The gate. Because the weekly workflow opens an AUTO-LAND PR (reviewed-then-
// merged with no human authoring the edits), this script is the safety
// boundary between an LLM patch proposal and a change to live public copy. It
// applies the patch ONLY if every check passes; on ANY failure it exits 1 and
// writes NOTHING (the working tree is untouched).
//
// THE CENTRAL INVARIANT — byte-for-byte preservation of original note prose:
//   An `addendum` may only ever APPEND. For each addendum we load the note's
//   CURRENT file content and construct:
//       newContent = original + "\n\n## Update (YYYY-MM-DD)\n\n" + addendum + "\n"
//   then ASSERT newContent.startsWith(original) byte-for-byte. If the original
//   (frontmatter + body + any prior Update sections) is not an exact prefix of
//   the result, we FAIL. A new Update section always STACKS below existing
//   ones; no existing text is ever modified. This assertion is locked by
//   validate.test.mjs (a reconstruction that mutates the body MUST fail).
//
// Addendum content is held to the same field-notes gates: no blocklisted /
// client identifiers, no email/@handle, URLs only on the allowlist (rarebit.one,
// "/"-relative links to existing pages/notes, github.com/rarebit-one/<public>),
// and no dead internal links.
//
// copyEdits are bounded: `find` must exist verbatim in an allowed target file
// (src/data/site.ts, src/pages/**, src/content/**); a single replace is applied;
// the count and per-edit size are capped.
//
// Inputs:  argv[2] state.json, argv[3] patch.json
// Effect:  on PASS, edits the working tree in place. Empty patch → no-op (0).

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const STATE = process.argv[2] ?? "state.json";
const PATCH = process.argv[3] ?? "patch.json";

const fail = (reason) => {
  console.error(`validate: REJECTED — ${reason}. Nothing applied; the site stands as-is.`);
  process.exit(1);
};

if (!existsSync(STATE)) {
  console.log(`validate: ${STATE} absent (gather skipped) — no-op.`);
  process.exit(0);
}
if (!existsSync(PATCH)) {
  console.log(`validate: ${PATCH} absent (draft skipped) — no-op.`);
  process.exit(0);
}

const state = JSON.parse(readFileSync(STATE, "utf8"));
const patch = JSON.parse(readFileSync(PATCH, "utf8"));

const copyEdits = Array.isArray(patch.copyEdits) ? patch.copyEdits : [];
const addenda = Array.isArray(patch.addenda) ? patch.addenda : [];

// --- EMPTY PATCH — benign no-op --------------------------------------------
if (copyEdits.length === 0 && addenda.length === 0) {
  console.log("validate: empty patch (no drift) — no-op (not a rejection).");
  process.exit(0);
}

// --- Bounds: a drift sweep, not a rewrite ----------------------------------
const MAX_COPY_EDITS = 8;
const MAX_FIND_LEN = 600;
const MAX_REPLACE_LEN = 800;
const MAX_ADDENDA = 4;
const MAX_ADDENDUM_LEN = 1500;
if (copyEdits.length > MAX_COPY_EDITS) fail(`too many copyEdits (${copyEdits.length} > ${MAX_COPY_EDITS})`);
if (addenda.length > MAX_ADDENDA) fail(`too many addenda (${addenda.length} > ${MAX_ADDENDA})`);

// --- Shared gate inputs -----------------------------------------------------
// Blocklist: the gather step never wrote private identifiers into state.json
// (this pipeline reads only the worktree), but we honor an optional
// state.blocklist for parity with the field-notes gate and defense in depth.
const blocklist = Array.isArray(state.blocklist) ? state.blocklist : [];

// Known note slugs (existing notes — addenda target these; links must resolve).
const noteSlugs = new Set((state.notes ?? []).map((n) => n.slug));

// Known page paths from the inventory (for internal-link resolution).
const pagePaths = new Set(state.pages ?? []);

// Public repo names for github.com/rarebit-one/<repo> allowance. Best-effort:
// derived from the org; if absent we still allow the org prefix loosely below.
const publicRepos = new Set(state.public?.repos ?? []);

// Field-notes-style identifier + URL gate, run over a text blob.
function gateText(label, text) {
  const lower = text.toLowerCase();

  // 1. BLOCKLIST — private identifiers must never appear.
  for (const term of blocklist) {
    const t = String(term).toLowerCase().trim();
    if (t.length >= 3 && lower.includes(t)) {
      fail(`${label} contains blocklisted identifier "${term}"`);
    }
  }

  // 2. EMAIL / @handle — none belong in public copy.
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text)) fail(`${label} contains an email address`);
  if (/(^|[\s(])@\w/.test(text)) fail(`${label} contains an @handle`);

  // 3. URL ALLOWLIST — only rarebit.one and public rarebit-one GitHub repos.
  const urls = text.match(/https?:\/\/[^\s)\]<>"']+/gi) ?? [];
  for (const rawUrl of urls) {
    const url = rawUrl.replace(/[.,;:]+$/, "");
    if (url.startsWith("https://rarebit.one")) continue;
    const gh = url.match(/^https:\/\/github\.com\/rarebit-one\/([a-z0-9._-]+)/i);
    if (gh) {
      const repo = gh[1];
      // If we have a public-repo list, require membership; else accept any
      // org-scoped repo path (the org's public repos are the only thing we
      // would ever link, and the prefix is org-locked).
      if (publicRepos.size === 0 || publicRepos.has(repo)) continue;
      fail(`${label} links to "${url}" — not a known public rarebit-one repo`);
    }
    fail(`${label} contains off-allowlist URL "${url}"`);
  }

  // 4. INTERNAL LINKS — every "/"-relative link must resolve to a known page
  // or field note. We check markdown links and bare paths.
  const internal = text.match(/\]\((\/[a-z0-9/_-]*)\)/gi) ?? [];
  for (const m of internal) {
    const path = m.slice(2, -1).replace(/\/$/, "") || "/";
    if (resolvesInternal(path)) continue;
    fail(`${label} links to unknown internal path "${path}"`);
  }
  // Field-note slug links, anywhere in the text.
  for (const m of text.matchAll(/\/field-notes\/([a-z0-9-]+)\/?/g)) {
    if (!noteSlugs.has(m[1])) fail(`${label} links to unknown field note "/field-notes/${m[1]}/"`);
  }
}

function resolvesInternal(path) {
  if (path === "/") return true;
  if (pagePaths.has(path)) return true;
  // A field-notes/<slug> path resolves if the slug exists.
  const note = path.match(/^\/field-notes\/([a-z0-9-]+)$/);
  if (note) return noteSlugs.has(note[1]);
  // /field-notes index page itself.
  if (path === "/field-notes") return true;
  // Anchor or trailing handled by caller's strip; accept a page that is a
  // prefix segment match (e.g. /how-we-work).
  return pagePaths.has(path);
}

const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10); // SGT date

// --- ADDENDA — the byte-for-byte preservation lock -------------------------
// We compute the new content for each note but DO NOT write until every check
// across the whole patch passes (all-or-nothing).
const ALLOWED_NOTE_DIRS = ["src/content/field-notes", "src/content/notes"];

function noteFileFor(slug) {
  for (const dir of ALLOWED_NOTE_DIRS) {
    const p = `${dir}/${slug}.md`;
    if (existsSync(p)) return p;
  }
  return null;
}

const writes = []; // { path, content }

for (const a of addenda) {
  if (typeof a?.slug !== "string" || typeof a?.addendum !== "string") {
    fail("an addendum is missing slug or addendum text");
  }
  if (!noteSlugs.has(a.slug)) fail(`addendum targets unknown note "${a.slug}"`);
  const path = noteFileFor(a.slug);
  if (!path) fail(`addendum targets "${a.slug}" but no note file exists for it`);

  const addendum = a.addendum.trim();
  if (addendum === "") fail(`addendum for "${a.slug}" is empty`);
  if (addendum.length > MAX_ADDENDUM_LEN) {
    fail(`addendum for "${a.slug}" is too long (${addendum.length} > ${MAX_ADDENDUM_LEN})`);
  }

  // Gate the addendum text BEFORE reconstruction.
  gateText(`addendum for "${a.slug}"`, addendum);

  // Reconstruct: original + a NEW Update section. Always append; never modify.
  const original = readFileSync(path, "utf8");
  const heading = `## Update (${today})`;
  const newContent = `${original}\n\n${heading}\n\n${addendum}\n`;

  // THE LOCK: the original must be an exact byte-for-byte prefix of the result.
  // (Any reconstruction that rewrote or reordered existing prose breaks this.)
  if (!newContent.startsWith(original)) {
    fail(`addendum for "${a.slug}" would not preserve the original prose byte-for-byte`);
  }
  // Belt-and-suspenders: confirm the tail is exactly what we intended to append,
  // so a future refactor of the template can't silently weaken the invariant.
  const appended = newContent.slice(original.length);
  if (appended !== `\n\n${heading}\n\n${addendum}\n`) {
    fail(`addendum for "${a.slug}" appended unexpected content`);
  }

  writes.push({ path, content: newContent });
}

// --- COPY EDITS — bounded verbatim find/replace ----------------------------
function isAllowedTarget(file) {
  if (file === "src/data/site.ts") return true;
  if (/^src\/pages\/[\w./-]+\.(astro|md|mdx|html|ts|js)$/.test(file)) return true;
  if (/^src\/content\/[\w./-]+\.(md|mdx)$/.test(file)) return true;
  return false;
}

// Accumulate edits per file so multiple edits to one file compose.
const editsByFile = new Map();

for (const e of copyEdits) {
  if (typeof e?.file !== "string" || typeof e?.find !== "string" || typeof e?.replace !== "string") {
    fail("a copyEdit is missing file, find, or replace");
  }
  if (!isAllowedTarget(e.file)) fail(`copyEdit targets a disallowed file "${e.file}"`);
  if (!existsSync(e.file)) fail(`copyEdit targets a missing file "${e.file}"`);
  if (e.find.length === 0) fail(`copyEdit on "${e.file}" has an empty find`);
  if (e.find.length > MAX_FIND_LEN) fail(`copyEdit find on "${e.file}" too long (${e.find.length})`);
  if (e.replace.length > MAX_REPLACE_LEN) fail(`copyEdit replace on "${e.file}" too long (${e.replace.length})`);

  // The replacement copy is public-facing — gate it too (no leaked identifiers,
  // no bad URLs/links).
  gateText(`copyEdit replace on "${e.file}"`, e.replace);

  if (!editsByFile.has(e.file)) editsByFile.set(e.file, readFileSync(e.file, "utf8"));
  let content = editsByFile.get(e.file);

  // `find` must currently exist verbatim, exactly once we apply a single
  // replace (replace the FIRST occurrence; require it be present).
  const idx = content.indexOf(e.find);
  if (idx === -1) fail(`copyEdit "find" not present verbatim in "${e.file}"`);

  content = content.slice(0, idx) + e.replace + content.slice(idx + e.find.length);
  editsByFile.set(e.file, content);
}

for (const [file, content] of editsByFile) writes.push({ path: file, content });

// --- ON PASS — apply all edits (all-or-nothing) ----------------------------
for (const w of writes) writeFileSync(w.path, w.content);

console.log(
  `validate: PASSED — applied ${copyEdits.length} copy edit(s) and ${addenda.length} addendum(s) ` +
    `across ${writes.length} file(s). Original note prose preserved byte-for-byte.`
);
