// Notebook pipeline · step 4 of 4 — PUBLISH (network; NOT the gate).
//
// Turns the validated idea-seeds into PUBLIC GitHub issues in THIS repo,
// labeled `field-note-seed`. This replaces the old private DO Spaces notebook
// object: each open issue is a pending seed (open = candidate, closed = used),
// so the issue lifecycle IS the retention mechanism — no rolling file, no
// SigV4, no bucket. Seeds are sanitized, public-work-derived angles, so a
// public issue is safe and on-brand.
//
// This step runs AFTER validate.mjs — no seed reaches an issue without first
// clearing the leak gate. publish itself does no sanitization; it only creates
// issues from already-validated seeds, deduping against open ones.
//
// Each created issue embeds a hidden round-trip marker in its body:
//   <!-- seed:{"angle":"…","grounding":[…]} -->
// so field-notes/gather.mjs can recover the structured seed later.
//
// Dedup: skip a seed whose PRIMARY grounding URL already appears in an open
// seed issue (parsed from the existing markers, with a text fallback).
//
// Graceful: missing validated-seeds.json or no GitHub token → no-op (exit 0).
// Never crash the workflow.
//
// Input: argv[2] (default ./validated-seeds.json). Uses the `gh` CLI with
// GH_TOKEN / GITHUB_TOKEN from the environment.

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const IN = process.argv[2] ?? "validated-seeds.json";
const LABEL = "field-note-seed";
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

if (!existsSync(IN)) {
  console.log(`publish: ${IN} absent (validate produced nothing) — skipping (graceful no-op).`);
  process.exit(0);
}
if (!TOKEN) {
  console.log("publish: no GH_TOKEN / GITHUB_TOKEN set — skipping (graceful no-op).");
  process.exit(0);
}

// Run a `gh` subcommand with the token in env. Returns { ok, stdout, stderr }.
function gh(args, { capture = true } = {}) {
  const res = spawnSync("gh", args, {
    encoding: "utf8",
    env: { ...process.env, GH_TOKEN: TOKEN },
  });
  return {
    ok: res.status === 0,
    stdout: capture ? (res.stdout ?? "") : "",
    stderr: res.stderr ?? "",
    status: res.status,
  };
}

const parsed = JSON.parse(readFileSync(IN, "utf8"));
const seeds = Array.isArray(parsed?.seeds) ? parsed.seeds : [];
if (seeds.length === 0) {
  console.log("publish: no seeds in input — nothing to publish.");
  process.exit(0);
}

// Ensure the label exists (idempotent — ignore "already exists" failures).
gh([
  "label",
  "create",
  LABEL,
  "--color",
  "C5DEF5",
  "--description",
  "Candidate angle for a future field note (farm-scouted)",
]);

// Collect grounding URLs already represented by OPEN seed issues, so we don't
// file a near-duplicate. We parse the hidden marker first; if it's missing or
// unparseable, fall back to scraping URLs from the issue body text.
const existingUrls = new Set();
const list = gh([
  "issue",
  "list",
  "--label",
  LABEL,
  "--state",
  "open",
  "--json",
  "number,body",
  "--limit",
  "100",
]);
if (list.ok) {
  let issues = [];
  try {
    issues = JSON.parse(list.stdout || "[]");
  } catch {
    issues = [];
  }
  // The listing is capped at 100 (no pagination). Beyond that, older open seed
  // issues fall off the page and escape dedup silently — a duplicate could slip
  // through. Warn loudly so it's visible; full pagination is tracked separately.
  if (issues.length >= 100) {
    console.log(
      "::warning::publish: hit the 100-issue dedup cap — open seeds beyond 100 are not checked for duplicates. Triage/close stale seeds or add pagination."
    );
  }
  for (const issue of issues) {
    const body = String(issue?.body ?? "");
    const marker = body.match(/<!--\s*seed:(\{[\s\S]*?\})\s*-->/);
    let added = false;
    if (marker) {
      try {
        const seed = JSON.parse(marker[1]);
        for (const u of Array.isArray(seed?.grounding) ? seed.grounding : []) {
          if (typeof u === "string") existingUrls.add(u);
        }
        added = true;
      } catch {
        // fall through to text scrape
      }
    }
    if (!added) {
      for (const u of body.match(/https?:\/\/[^\s)\]<>"']+/gi) ?? []) {
        existingUrls.add(u.replace(/[.,;:]+$/, ""));
      }
    }
  }
} else {
  console.log("publish: could not list existing seed issues — proceeding without dedup.");
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

  // DEDUP — skip if the primary grounding URL is already on an open seed issue.
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
  const marker = JSON.stringify({ angle, grounding });
  const body = [
    angle,
    "",
    "**Grounded in:**",
    "",
    groundingList,
    "",
    `_Auto-scouted by the farm's notebook on ${today}. A candidate angle for a future field note — edit, comment, or close freely._`,
    "",
    `<!-- seed:${marker} -->`,
  ].join("\n");

  const res = gh(["issue", "create", "--label", LABEL, "--title", title, "--body", body], {
    capture: true,
  });
  if (res.ok) {
    created += 1;
    // Record the new seed's grounding so later seeds in this run dedup too.
    for (const u of grounding) existingUrls.add(u);
    console.log(`publish: created issue — ${title}`);
  } else {
    console.log(`publish: issue create failed (${res.status}) — ${res.stderr.trim()}`);
  }
}

console.log(`publish: ${created} issue(s) created, ${skipped} skipped as duplicates.`);
