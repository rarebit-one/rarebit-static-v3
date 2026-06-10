// Field-notes pipeline · step 3 of 3 — VALIDATE + ASSEMBLE (deterministic).
//
// The closing half of the "digest sandwich", and — because the workflow
// auto-commits the result to main with NO human review between draft and
// publish — the SOLE GATE before publication. The drafter is trusted only to
// phrase; this script decides what may ship. It HARD-FAILS (exit 1, nothing
// written) if the draft contains anything that could leak a client or break a
// link:
//   1. any private blocklist identifier (private repo names, member logins)
//   2. any URL not on the allowlist built from the facts (public PR/release
//      URLs, https://github.com/rarebit-one/<public-repo>, https://rarebit.one)
//   3. any email address or @handle
//   4. any /field-notes/<slug>/ link that resolves to neither a past note nor
//      this note's own slug (no dead internal links)
//   5. a malformed shape (empty fields, non-kebab slug)
//
// A "thin week" (no public PRs/releases AND no private events) is a benign
// no-op, not a failure — we don't invent filler.
//
// On pass it assembles the markdown file (frontmatter + body) and writes it.
//
// Inputs:  argv[2] facts.json, argv[3] draft.json
// Output:  argv[4] (default src/content/field-notes/<slug>.md)

import { existsSync, writeFileSync, readFileSync } from "node:fs";

const FACTS = process.argv[2] ?? "facts.json";
const DRAFT = process.argv[3] ?? "draft.json";
const OUT_ARG = process.argv[4]; // explicit path or directory; default derived below

const facts = JSON.parse(readFileSync(FACTS, "utf8"));
const draft = JSON.parse(readFileSync(DRAFT, "utf8"));

const fail = (reason) => {
  console.error(`validate: REJECTED — ${reason}. Nothing published; previous notes stand.`);
  process.exit(1);
};

// --- THIN-WEEK NO-OP (not a failure) ---------------------------------------
// If there's nothing worth a note, exit 0 without writing — mirrors farm-feed's
// empty-day handling. We never force filler ("never invent metrics").
const prs = facts.public?.prs ?? [];
const releases = facts.public?.releases ?? [];
const privateEvents = facts.private?.events ?? [];
if (prs.length === 0 && releases.length === 0 && privateEvents.length === 0) {
  console.log("validate: thin week (no public PRs/releases, no private events) — skipping (not a rejection).");
  process.exit(0);
}

// --- SHAPE gate (5) — check before scanning so errors are clear -------------
for (const field of ["title", "description", "slug", "body"]) {
  if (typeof draft[field] !== "string" || draft[field].trim() === "") {
    fail(`draft field "${field}" is missing or empty`);
  }
}
if (!/^[a-z0-9-]+$/.test(draft.slug)) fail(`slug "${draft.slug}" is not kebab-case`);

// The scan blob — everything the model produced.
const blob = [draft.title, draft.description, draft.body].join("\n");
const blobLower = blob.toLowerCase();

// --- 1. BLOCKLIST — private identifiers must never appear -------------------
// Guard trivially short terms (a 2-char repo name would false-positive).
for (const term of facts.private?.blocklist ?? []) {
  const t = String(term).toLowerCase().trim();
  if (t.length >= 3 && blobLower.includes(t)) {
    fail(`output contains blocklisted identifier "${term}"`);
  }
}

// --- 3. EMAIL / @handle — none belong in a public note ----------------------
// (Checked before URLs so an email isn't mistaken for a bare token.)
if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(blob)) fail("output contains an email address");
if (/(^|[\s(])@\w/.test(blob)) fail("output contains an @handle");

// --- 2. URL ALLOWLIST — every URL must trace to the facts -------------------
const allowedPrefixes = new Set(["https://rarebit.one"]);
for (const pr of prs) if (pr.url) allowedPrefixes.add(pr.url);
for (const rel of releases) if (rel.url) allowedPrefixes.add(rel.url);
for (const repo of facts.public?.repos ?? []) {
  allowedPrefixes.add(`https://github.com/rarebit-one/${repo}`);
}
const urls = blob.match(/https?:\/\/[^\s)\]<>"']+/gi) ?? [];
for (const rawUrl of urls) {
  const url = rawUrl.replace(/[.,;:]+$/, ""); // trailing punctuation isn't part of the URL
  const ok = [...allowedPrefixes].some((prefix) => url.startsWith(prefix));
  if (!ok) fail(`output contains off-allowlist URL "${url}"`);
}

// --- 4. INTERNAL LINKS — every /field-notes/<slug>/ must resolve ------------
const knownSlugs = new Set([draft.slug, ...(facts.pastNotes ?? []).map((n) => n.slug)]);
for (const match of blob.matchAll(/\/field-notes\/([a-z0-9-]+)\/?/g)) {
  const slug = match[1];
  if (!knownSlugs.has(slug)) fail(`output links to unknown field note "/field-notes/${slug}/"`);
}

// --- ON PASS — assemble the markdown ---------------------------------------
// pubDate: now, as ISO 8601 with the +08:00 (SGT) offset.
const now = new Date(Date.now() + 8 * 3600_000);
const pubDate = `${now.toISOString().slice(0, 19)}+08:00`;

const markdown = `---
title: "${draft.title.replace(/"/g, '\\"')}"
description: "${draft.description.replace(/"/g, '\\"')}"
pubDate: ${pubDate}
---

${draft.body.trim()}
`;

// Resolve the output path. argv[4] may be an explicit file, a directory, or
// absent (default the content collection). If the target file already exists,
// suffix with the window end date to avoid clobbering.
function resolveOutPath() {
  const slugFile = `${draft.slug}.md`;
  if (OUT_ARG && OUT_ARG.endsWith(".md")) return OUT_ARG;
  const dir = (OUT_ARG ?? "src/content/field-notes").replace(/\/$/, "");
  let path = `${dir}/${slugFile}`;
  if (existsSync(path)) path = `${dir}/${draft.slug}-${facts.window.to}.md`;
  return path;
}

const outPath = resolveOutPath();
writeFileSync(outPath, markdown);
console.log(`validate: PASSED — "${draft.title}" written to ${outPath} (window ${facts.window.from}..${facts.window.to})`);
