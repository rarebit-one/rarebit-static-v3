// Notebook pipeline · step 3 of 3 — VALIDATE (deterministic, pure, no network).
//
// The closing half of the "digest sandwich", and — because the daily workflow
// turns these seeds straight into PUBLIC GitHub issues with NO human review
// between curate and publish — the SOLE GATE before a seed becomes a public
// issue. The curator is trusted only to phrase; this script decides what may
// be published. It HARD-FAILS (exit 1, nothing written) if any seed contains
// anything that could leak a client or smuggle in an off-facts link:
//   1. any private blocklist identifier (private repo names, member logins)
//   2. any email address or @handle
//   3. any URL whose origin is NOT on the allowlist built from the facts
//      (public PR/release/commit URLs, https://github.com/rarebit-one/<public
//      repo>, https://rarebit.one)
// Mirrors farm-feed/validate.mjs and field-notes/validate.mjs exactly.
//
// On pass it writes a deterministic validated-seeds.json = { seeds: [...] }
// containing only the seeds that passed the gate. The publish step (step 4,
// scripts/notebook/publish.mjs) turns those into issues; retention is now the
// issue lifecycle (open = pending, closed = used), not a rolling file — so this
// script no longer merges, timestamps, retains, or caps. It does NO network and
// stays pure + unit-testable. An empty (or clean-empty) scout day is a benign
// no-op (exit 0, nothing written).
//
// Inputs:  argv[2] notebook-raw.json (for the blocklist + URL allowlist)
//          argv[3] seeds.json (the curated seeds)
// Output:  argv[4] (default ./validated-seeds.json) — the seeds that passed

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const RAW = process.argv[2] ?? "notebook-raw.json";
const SEEDS = process.argv[3] ?? "seeds.json";
const OUT = process.argv[4] ?? "validated-seeds.json";

const fail = (reason) => {
  console.error(`validate: REJECTED — ${reason}. Nothing written; no issues created.`);
  process.exit(1);
};

// Match a blocklisted identifier only as a whole token — not as a substring of a
// longer identifier. Without this, the PRIVATE repo "rarebit-static" matches inside
// the PUBLIC "rarebit-static-v3" this site is about (a guaranteed false positive).
function containsIdentifier(haystackLower, termLower) {
  const idChar = /[a-z0-9_-]/; // chars that continue a repo/login identifier
  for (let from = 0; ; ) {
    const i = haystackLower.indexOf(termLower, from);
    if (i === -1) return false;
    const before = i > 0 ? haystackLower[i - 1] : "";
    const after = i + termLower.length < haystackLower.length ? haystackLower[i + termLower.length] : "";
    const boundedLeft = !before || !idChar.test(before);
    const boundedRight = !after || !idChar.test(after);
    if (boundedLeft && boundedRight) return true;
    from = i + 1;
  }
}

const raw = JSON.parse(readFileSync(RAW, "utf8"));
const curated = existsSync(SEEDS) ? JSON.parse(readFileSync(SEEDS, "utf8")) : { seeds: [] };

const newSeeds = Array.isArray(curated.seeds) ? curated.seeds : [];

// --- EMPTY-DAY NO-OP (not a failure) ---------------------------------------
// No seeds to publish → nothing to validate. Mirrors the empty-day handling in
// the sibling pipelines; not a policy violation.
if (newSeeds.length === 0) {
  console.log("validate: no seeds to publish — skipping (not a rejection).");
  process.exit(0);
}

// --- SHAPE + SCAN gate over the seeds ---------------------------------------
// Build the scan blob from each seed's angle + grounding URLs.
const blob = newSeeds
  .map((s) => [s?.angle ?? "", ...(Array.isArray(s?.grounding) ? s.grounding : [])].join("\n"))
  .join("\n");
const blobLower = blob.toLowerCase();

// 1. BLOCKLIST — private identifiers must never appear. Guard trivially short
//    terms (a 2-char repo name would false-positive). >= 3 chars, like siblings.
for (const term of raw.blocklist ?? []) {
  const t = String(term).toLowerCase().trim();
  if (t.length >= 3 && containsIdentifier(blobLower, t)) {
    fail(`seed contains blocklisted identifier "${term}"`);
  }
}

// 2. EMAIL / @handle — none belong in an idea-seed.
if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(blob)) fail("seed contains an email address");
// @handle in ANY non-word position — start, or after whitespace/punctuation
// (",@user", "/@user", "[@user"). A bare [\s(] class missed those. Emails are
// caught above; "." before @ is excluded so this doesn't double-flag them.
if (/(^|[^\w.])@\w/.test(blob)) fail("seed contains an @handle");

// 3. URL ALLOWLIST — every URL must trace to the facts. The allowlist is the
//    set of public item URLs from the raw, plus the org-public repo prefixes
//    and rarebit.one. Anything else is off-facts and rejected.
const allowedPrefixes = new Set(["https://rarebit.one"]);
const publicItems = Array.isArray(raw.public) ? raw.public : [];
for (const item of publicItems) {
  if (item?.url) allowedPrefixes.add(item.url);
  if (item?.repo) allowedPrefixes.add(`https://github.com/rarebit-one/${item.repo}`);
}
// A URL matches a prefix only at a real boundary — exact match, or the next
// char is a path/query/fragment separator. This rejects look-alikes like
// "https://rarebit.one.evil.com" that a bare startsWith() would wave through.
const matchesPrefix = (url, prefix) => {
  if (!url.startsWith(prefix)) return false;
  if (url.length === prefix.length) return true;
  return ["/", "?", "#"].includes(url[prefix.length]);
};
const urls = blob.match(/https?:\/\/[^\s)\]<>"']+/gi) ?? [];
for (const rawUrl of urls) {
  const url = rawUrl.replace(/[.,;:]+$/, ""); // trailing punctuation isn't part of the URL
  const ok = [...allowedPrefixes].some((prefix) => matchesPrefix(url, prefix));
  if (!ok) fail(`seed contains off-allowlist URL "${url}"`);
}

// --- ON PASS — write the validated seeds (deterministic, no timestamps) -----
// Keep only well-formed seeds (non-empty angle), normalized to { angle,
// grounding } with string-only grounding URLs. The publish step dedups + maps
// these to issues; the issue lifecycle is the retention mechanism now.
const validated = newSeeds
  .filter((s) => s && typeof s.angle === "string" && s.angle.trim() !== "")
  .map((s) => ({
    angle: s.angle.trim(),
    grounding: (Array.isArray(s.grounding) ? s.grounding : []).filter((u) => typeof u === "string"),
  }));

// A clean-empty day (seeds present but all malformed) → no-op, nothing written.
if (validated.length === 0) {
  console.log("validate: no well-formed seeds after the gate — skipping (not a rejection).");
  process.exit(0);
}

writeFileSync(OUT, JSON.stringify({ seeds: validated }, null, 2));
console.log(`validate: PASSED — ${validated.length} seed(s) cleared the gate → ${OUT}`);
