// Notebook pipeline · step 3 of 3 — VALIDATE + MERGE (deterministic).
//
// The closing half of the "digest sandwich", and — because the daily workflow
// writes the merged notebook back to the bucket with NO human review between
// curate and publish — the SOLE GATE before a seed enters the notebook. The
// curator is trusted only to phrase; this script decides what may persist. It
// HARD-FAILS (exit 1, nothing written) if any seed contains anything that
// could leak a client or smuggle in an off-facts link:
//   1. any private blocklist identifier (private repo names, member logins)
//   2. any email address or @handle
//   3. any URL whose origin is NOT on the allowlist built from the facts
//      (public PR/release/commit URLs, https://github.com/rarebit-one/<public
//      repo>, https://rarebit.one)
// Mirrors farm-feed/validate.mjs and field-notes/validate.mjs exactly.
//
// On pass it timestamps the new seeds, MERGES them with the existing notebook
// (passed in; may be absent), DROPS any seed older than 14 days (SGT), caps the
// total, and writes the merged notebook.json. An empty scout day with no
// existing notebook is a benign no-op (exit 0, nothing written).
//
// Inputs:  argv[2] notebook-raw.json (for the blocklist + URL allowlist)
//          argv[3] seeds.json (the curated seeds)
//          argv[4] notebook.json (the EXISTING notebook to merge into; may be
//                  absent — pass a path that doesn't exist, or omit)
// Output:  argv[5] (default ./notebook.json) — the merged notebook

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const RAW = process.argv[2] ?? "notebook-raw.json";
const SEEDS = process.argv[3] ?? "seeds.json";
const EXISTING = process.argv[4]; // existing notebook path; may be absent
const OUT = process.argv[5] ?? "notebook.json";

const RETENTION_DAYS = 14;
const MAX_SEEDS = 60;

const fail = (reason) => {
  console.error(`validate: REJECTED — ${reason}. Nothing written; previous notebook stands.`);
  process.exit(1);
};

const raw = JSON.parse(readFileSync(RAW, "utf8"));
const curated = existsSync(SEEDS) ? JSON.parse(readFileSync(SEEDS, "utf8")) : { seeds: [] };
const existing = EXISTING && existsSync(EXISTING) ? JSON.parse(readFileSync(EXISTING, "utf8")) : { seeds: [] };

const newSeeds = Array.isArray(curated.seeds) ? curated.seeds : [];
const existingSeeds = Array.isArray(existing.seeds) ? existing.seeds : [];

// --- EMPTY-DAY NO-OP (not a failure) ---------------------------------------
// No new seeds AND no existing notebook → nothing to persist. Mirrors the
// empty-day handling in the sibling pipelines; not a policy violation.
if (newSeeds.length === 0 && existingSeeds.length === 0) {
  console.log("validate: no new seeds and no existing notebook — skipping (not a rejection).");
  process.exit(0);
}

// --- SHAPE + SCAN gate over the NEW seeds only ------------------------------
// (Existing seeds already passed this gate on the day they were added.)
// Build the scan blob from each seed's angle + grounding URLs.
const blob = newSeeds
  .map((s) => [s?.angle ?? "", ...(Array.isArray(s?.grounding) ? s.grounding : [])].join("\n"))
  .join("\n");
const blobLower = blob.toLowerCase();

// 1. BLOCKLIST — private identifiers must never appear. Guard trivially short
//    terms (a 2-char repo name would false-positive). >= 3 chars, like siblings.
for (const term of raw.blocklist ?? []) {
  const t = String(term).toLowerCase().trim();
  if (t.length >= 3 && blobLower.includes(t)) {
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

// --- ON PASS — timestamp, merge, retain, cap -------------------------------
// `at` is now as ISO 8601 with the +08:00 (SGT) offset, mirroring field-notes.
const now = new Date(Date.now() + 8 * 3600_000);
const at = `${now.toISOString().slice(0, 19)}+08:00`;

const fresh = newSeeds
  .filter((s) => s && typeof s.angle === "string" && s.angle.trim() !== "")
  .map((s) => ({
    at,
    angle: s.angle.trim(),
    grounding: (Array.isArray(s.grounding) ? s.grounding : []).filter((u) => typeof u === "string"),
  }));

// Merge fresh + existing, drop anything older than the retention window. The
// cutoff is computed in real time (UTC instant); each seed's `at` carries its
// own +08:00 offset so the comparison is zone-correct.
const cutoff = Date.now() - RETENTION_DAYS * 24 * 3600_000;
const merged = [...fresh, ...existingSeeds]
  .filter((s) => s && typeof s.angle === "string")
  .filter((s) => {
    const t = Date.parse(s.at);
    return Number.isNaN(t) ? false : t >= cutoff; // drop undateable / stale seeds
  });

// Newest first, then cap. The draft dedupes against past notes downstream;
// retention + cap keep the notebook bounded without active pruning elsewhere.
merged.sort((a, b) => String(b.at).localeCompare(String(a.at)));
const capped = merged.slice(0, MAX_SEEDS);

const notebook = {
  generated: new Date().toISOString(),
  window: raw.window,
  seeds: capped,
};

writeFileSync(OUT, JSON.stringify(notebook, null, 2));
console.log(
  `validate: PASSED — +${fresh.length} new, ${capped.length} total seeds after ${RETENTION_DAYS}d retention → ${OUT}`
);
