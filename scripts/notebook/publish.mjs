// Notebook pipeline · step 4 of 4 — PUBLISH (network; NOT the gate).
//
// The notebook is a SENSOR in the sensors/actors paradigm (see
// docs/architecture/sensors-and-actors.md): it turns validated idea-seeds into
// PUBLIC GitHub issues in THIS repo, labeled `field-note-seed`. Each open issue
// is a pending seed (open = candidate, closed = used), so the issue lifecycle IS
// the retention mechanism — no rolling file, no SigV4, no bucket. Seeds are
// sanitized, public-work-derived angles, so a public issue is safe and on-brand.
//
// This step runs AFTER validate.mjs — no seed reaches an issue without first
// clearing the leak gate (the queue is the trust boundary: gate first, emit
// second). publish itself does no sanitization; it only creates issues from
// already-validated seeds, deduping against open ones.
//
// RETROFIT (issue #56): this used to hand-roll its `<!-- seed:{json} -->` marker
// and its open-issue dedup inline. It now rides the shared contract in
// scripts/lib/issues.mjs (ensureLabel / listOpenIssues / parseMarker / dedupeBy /
// emitIssue), the same module the voice + drift sensors use. BEHAVIOUR IS
// UNCHANGED: the label stays `field-note-seed`, and the marker stays
// `<!-- seed:{"angle":…,"grounding":[…]} -->` (marker TYPE = "seed", distinct
// from the label) — so seeds filed before this change still parse and dedup
// exactly as before. The dedup key is still the PRIMARY grounding URL.
//
// On the dedup rule specifically: a candidate is skipped iff its PRIMARY
// grounding URL (grounding[0]) already appears among the grounding URLs of the
// open seed queue OR an earlier-accepted candidate in this same run. That is the
// "check the primary, but remember ALL grounding of anything filed" asymmetry the
// inline loop had — it is intentionally NOT a plain dedupeBy (whose single keyFn
// checks and records the same keys), so we keep the explicit running set here and
// reserve dedupeBy for symmetric callers. The contract still backs every other
// step: ensureLabel, listOpenIssues, parseMarker, and emitIssue.
//
// Graceful: missing validated-seeds.json or no GitHub token → no-op (exit 0).
// Never crash the workflow.
//
// Input: argv[2] (default ./validated-seeds.json). The IO helpers use the `gh`
// CLI with GH_TOKEN / GITHUB_TOKEN from the environment.

import { existsSync, readFileSync } from "node:fs";
import { emitIssue, ensureLabel, listOpenIssues, parseMarker } from "../lib/issues.mjs";

const IN = process.argv[2] ?? "validated-seeds.json";
const LABEL = "field-note-seed";
// The marker TYPE token is "seed", NOT the label. This is deliberate and
// load-bearing: open seed issues filed before the retrofit carry
// `<!-- seed:{…} -->`, so we must keep emitting + parsing that exact token for
// them to round-trip and dedup. buildMarker("seed", …) reproduces it byte-for-byte.
const MARKER_TYPE = "seed";
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

if (!existsSync(IN)) {
  console.log(`publish: ${IN} absent (validate produced nothing) — skipping (graceful no-op).`);
  process.exit(0);
}
if (!TOKEN) {
  console.log("publish: no GH_TOKEN / GITHUB_TOKEN set — skipping (graceful no-op).");
  process.exit(0);
}

const parsed = JSON.parse(readFileSync(IN, "utf8"));
const seeds = Array.isArray(parsed?.seeds) ? parsed.seeds : [];
if (seeds.length === 0) {
  console.log("publish: no seeds in input — nothing to publish.");
  process.exit(0);
}

// Ensure the label exists (idempotent). Same color/description as before.
ensureLabel(LABEL, "C5DEF5", "Candidate angle for a future field note (farm-scouted)");

// Read the OPEN seed queue via the shared contract, then seed the dedup set with
// every grounding URL already represented. listOpenIssues returns each issue's
// raw body; we recover grounding from the `seed:` marker (parseMarker with the
// correct MARKER_TYPE), falling back to scraping URLs from the body text when the
// marker is missing/unparseable — exactly the old fallback path.
const open = listOpenIssues(LABEL);
if (open.length >= 100) {
  console.log(
    "::warning::publish: hit the 100-issue dedup cap — open seeds beyond 100 are not checked for duplicates. Triage/close stale seeds or add pagination."
  );
}

const existingUrls = new Set();
for (const issue of open) {
  const m = parseMarker(issue.body, MARKER_TYPE);
  if (m && Array.isArray(m.data?.grounding)) {
    for (const u of m.data.grounding) {
      if (typeof u === "string") existingUrls.add(u);
    }
  } else {
    // Marker absent/unparseable — scrape URLs from the body text, matching the
    // legacy fallback (trailing punctuation trimmed).
    for (const u of issue.body.match(/https?:\/\/[^\s)\]<>"']+/gi) ?? []) {
      existingUrls.add(u.replace(/[.,;:]+$/, ""));
    }
  }
}

const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10); // YYYY-MM-DD (SGT)
let created = 0;
let skipped = 0;

for (const seed of seeds) {
  const angle = typeof seed?.angle === "string" ? seed.angle.trim() : "";
  if (!angle) continue;
  const grounding = (Array.isArray(seed?.grounding) ? seed.grounding : []).filter(
    (u) => typeof u === "string"
  );

  // DEDUP — skip if the PRIMARY grounding URL is already on an open seed issue (or
  // an earlier seed accepted this run). Identical rule to the inline version:
  // check the primary, but remember ALL grounding of anything filed.
  const primary = grounding[0];
  if (primary && existingUrls.has(primary)) {
    console.log(`publish: skipping (dup of an open seed) — ${angle.slice(0, 60)}`);
    skipped += 1;
    continue;
  }

  const title = angle.length > 100 ? `${angle.slice(0, 99).trimEnd()}…` : angle;
  const groundingList = grounding.length
    ? grounding.map((u) => `- ${u}`).join("\n")
    : "_No public links — a generic, anonymized observation._";
  const body = [
    angle,
    "",
    "**Grounded in:**",
    "",
    groundingList,
    "",
    `_Auto-scouted by the farm's notebook on ${today}. A candidate angle for a future field note — edit, comment, or close freely._`,
  ].join("\n");

  // emitIssue appends `<!-- seed:{"angle":…,"grounding":[…]} -->` via
  // buildMarker(MARKER_TYPE, data) — byte-identical to the old inline marker, so
  // the field-notes actor recovers the seed exactly as before. The label is
  // ensured a second time by emitIssue (idempotent); harmless.
  const num = emitIssue({
    label: LABEL,
    title,
    body,
    type: MARKER_TYPE,
    data: { angle, grounding },
  });
  if (num) {
    created += 1;
    // Record the new seed's grounding so later seeds in this run dedup too.
    for (const u of grounding) existingUrls.add(u);
    console.log(`publish: created issue #${num} — ${title}`);
  } else {
    console.log(`publish: issue create failed — ${title}`);
  }
}

console.log(`publish: ${created} issue(s) created, ${skipped} skipped as duplicates.`);
