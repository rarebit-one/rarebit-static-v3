// Shared contract for the SENSORS & ACTORS architecture.
// See docs/architecture/sensors-and-actors.md for the full paradigm.
//
// In that model, GitHub issues are the WORK QUEUE between decoupled producers
// (sensors: external input → labeled, schema'd issues) and consumers (actors:
// issues → codebase / external changes). Neither side knows the other; they
// share only a LABEL (the type) and a hidden BODY MARKER (the schema), so the
// queue round-trips reliably.
//
// This module generalizes the marker + dedup pattern that the notebook scout
// (scripts/notebook/publish.mjs, a sensor) and the field-notes gather
// (scripts/field-notes/gather.mjs, an actor) currently implement inline with a
// `<!-- seed:{json} -->` marker. Here that becomes a generic
// `<!-- <type>:{json} -->` marker plus reusable emit / list / claim / close
// helpers, so future sensor/actor pairs (voice, drift, and a generic `task`)
// can share one contract. The notebook/field-notes pair will be retrofitted
// onto this module NEXT — this module is ADDITIVE and changes no behavior yet.
//
// Design notes:
//   - PURE helpers (buildMarker / parseMarker / dedupeBy) carry no IO and are
//     unit-tested in issues.test.mjs.
//   - IO helpers shell out to the `gh` CLI with GH_TOKEN / GITHUB_TOKEN from the
//     environment (the same auth the existing scripts use). They are graceful:
//     a missing token or a failed `gh` call no-ops or returns an empty result
//     rather than throwing, so a flaky API never crashes a workflow.

import { spawnSync } from "node:child_process";

const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

// ---------------------------------------------------------------------------
// PURE helpers (no IO — unit-tested)
// ---------------------------------------------------------------------------

/**
 * Build the hidden round-trip marker embedded at the foot of an issue body.
 * Generalizes the notebook's `<!-- seed:{...} -->` to any work-item type.
 *
 *   buildMarker("voice-proposal", { angle: "…" })
 *     → '<!-- voice-proposal:{"angle":"…"} -->'
 *
 * The JSON is single-line (JSON.stringify default) so the matching regex in
 * parseMarker stays simple and the marker occupies one trailing line.
 *
 * @param {string} type  The work-item type (also the issue label).
 * @param {unknown} data Structured payload; must be JSON-serializable.
 * @returns {string} The HTML-comment marker.
 */
export function buildMarker(type, data) {
  return `<!-- ${type}:${JSON.stringify(data ?? {})} -->`;
}

/**
 * Recover the structured payload from an issue body's marker.
 *
 * Matches `<!-- <type>:{json} -->` for the GIVEN type (or any type when `type`
 * is omitted), and parses the JSON object. Returns null when no marker for that
 * type is present or the JSON is unparseable — callers fall back to title/body
 * scraping, exactly as the current scripts do.
 *
 * @param {string} body  The issue body text.
 * @param {string} [type] Restrict to this type; omit to match any type.
 * @returns {{ type: string, data: unknown } | null}
 */
export function parseMarker(body, type) {
  const text = String(body ?? "");
  // Type token: the caller's type (regex-escaped) or a generic non-greedy run
  // of marker-safe characters when matching any type.
  const typePat = type
    ? type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    : "[\\w-]+";
  const re = new RegExp(`<!--\\s*(${typePat}):(\\{[\\s\\S]*?\\})\\s*-->`);
  const m = text.match(re);
  if (!m) return null;
  try {
    return { type: m[1], data: JSON.parse(m[2]) };
  } catch {
    return null;
  }
}

/**
 * Drop candidates whose key already appears among the existing items — the
 * dedup primitive both the notebook publisher (by grounding URL) and future
 * sensors need so they never file a duplicate work item.
 *
 * keyFn may return a single key or an array of keys; a candidate is a dup if
 * ANY of its keys is already present. Falsy keys are ignored (treated as
 * "no key", never a dup).
 *
 * @template E, C
 * @param {E[]} existing    Items already in the queue.
 * @param {C[]} candidates  Items being considered for emission.
 * @param {(item: E | C) => (string | string[] | null | undefined)} keyFn
 * @returns {C[]} The candidates with no key collision against `existing`.
 */
export function dedupeBy(existing, candidates, keyFn) {
  const seen = new Set();
  const addKeys = (item) => {
    const k = keyFn(item);
    for (const key of Array.isArray(k) ? k : [k]) {
      if (key) seen.add(key);
    }
  };
  for (const item of existing ?? []) addKeys(item);

  const out = [];
  for (const cand of candidates ?? []) {
    const k = keyFn(cand);
    const keys = (Array.isArray(k) ? k : [k]).filter(Boolean);
    const isDup = keys.some((key) => seen.has(key));
    if (isDup) continue;
    out.push(cand);
    // Record this candidate's keys so later candidates in the same batch dedup
    // against it too (matches publish.mjs's intra-run dedup).
    for (const key of keys) seen.add(key);
  }
  return out;
}

// ---------------------------------------------------------------------------
// IO helpers (shell out to `gh`; graceful)
// ---------------------------------------------------------------------------

/**
 * Run a `gh` subcommand with the token injected into the environment.
 * Returns a uniform { ok, stdout, stderr, status } result — never throws.
 */
function gh(args) {
  const res = spawnSync("gh", args, {
    encoding: "utf8",
    env: { ...process.env, GH_TOKEN: TOKEN },
  });
  return {
    ok: res.status === 0,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    status: res.status,
  };
}

/** True when a GitHub token is available; IO helpers no-op without one. */
function hasToken() {
  if (TOKEN) return true;
  console.log("issues: no GH_TOKEN / GITHUB_TOKEN set — skipping (graceful no-op).");
  return false;
}

/**
 * Ensure a label exists with the given color/description. Idempotent: creates
 * it, and if it already exists, edits it to the desired color/description.
 * No-ops gracefully without a token.
 *
 * @returns {boolean} true if the label is in the desired state (or no-op).
 */
export function ensureLabel(name, color, description) {
  if (!hasToken()) return false;
  const create = gh([
    "label",
    "create",
    name,
    "--color",
    color,
    "--description",
    description,
  ]);
  if (create.ok) return true;
  // Already exists (or some other failure) — try to bring it to the desired
  // state with edit. `--force` on create is an alternative, but edit keeps the
  // intent explicit and works on older gh versions.
  const edit = gh([
    "label",
    "edit",
    name,
    "--color",
    color,
    "--description",
    description,
  ]);
  if (edit.ok) return true;
  console.log(`issues: could not ensure label "${name}" — ${edit.stderr.trim()}`);
  return false;
}

/**
 * Emit a work item: ensure its label exists, append the hidden type marker to
 * the body, and `gh issue create`. The marker makes the item round-trippable by
 * any actor via listOpenIssues / parseMarker.
 *
 * @param {object} o
 * @param {string} o.label  Label = work-item type (e.g. "voice-proposal").
 * @param {string} o.title
 * @param {string} o.body   Human-readable body; the marker is appended below it.
 * @param {string} [o.type] Marker type; defaults to the label.
 * @param {unknown} [o.data] Structured payload for the marker.
 * @returns {number | null} The created issue number, or null on no-op/failure.
 */
export function emitIssue({ label, title, body, type, data }) {
  if (!hasToken()) return null;
  ensureLabel(
    label,
    "C5DEF5",
    `${label} work item (sensors/actors queue)`
  );
  const marker = buildMarker(type ?? label, data ?? {});
  const fullBody = `${body}\n\n${marker}`;
  const res = gh([
    "issue",
    "create",
    "--label",
    label,
    "--title",
    title,
    "--body",
    fullBody,
  ]);
  if (!res.ok) {
    console.log(`issues: create failed (${res.status}) — ${res.stderr.trim()}`);
    return null;
  }
  // `gh issue create` prints the issue URL; recover the trailing number.
  const num = Number((res.stdout.trim().match(/\/(\d+)\s*$/) || [])[1]);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/**
 * List OPEN issues for a label (open = pending work), returning each with its
 * parsed marker payload under `data` (null when no marker / unparseable). This
 * is the actor's "read the queue" primitive.
 *
 * Graceful: a missing token or failed listing returns [] so a flaky API never
 * crashes the consumer.
 *
 * @param {string} label
 * @returns {{ number: number, title: string, body: string, data: unknown }[]}
 */
export function listOpenIssues(label) {
  if (!hasToken()) return [];
  const res = gh([
    "issue",
    "list",
    "--label",
    label,
    "--state",
    "open",
    "--json",
    "number,title,body",
    "--limit",
    "100",
  ]);
  if (!res.ok) {
    console.log(`issues: list failed for "${label}" (${res.status}) — ${res.stderr.trim()}`);
    return [];
  }
  let rows = [];
  try {
    rows = JSON.parse(res.stdout || "[]");
  } catch {
    rows = [];
  }
  return rows.map((r) => {
    const parsed = parseMarker(r?.body, label);
    return {
      number: r?.number,
      title: String(r?.title ?? ""),
      body: String(r?.body ?? ""),
      data: parsed ? parsed.data : null,
    };
  });
}

/**
 * Claim an open issue so a second actor run won't double-process it: add the
 * `in-progress` label (ensuring it exists first). Idempotent and graceful.
 *
 * @param {number} number
 * @returns {boolean} true on success (or no-op).
 */
export function claimIssue(number) {
  if (!hasToken()) return false;
  ensureLabel("in-progress", "FBCA04", "Claimed by an actor — being processed");
  const res = gh(["issue", "edit", String(number), "--add-label", "in-progress"]);
  if (!res.ok) {
    console.log(`issues: claim failed for #${number} (${res.status}) — ${res.stderr.trim()}`);
    return false;
  }
  return true;
}

/**
 * Release a claim: remove the `in-progress` label so the issue is an obvious
 * open candidate again. An actor calls this when it claimed an issue but then
 * did NOT complete the work (the gate rejected, or it was a benign no-op), so a
 * later run picks it up cleanly. Idempotent and graceful — a missing label or no
 * token is a no-op.
 *
 * @param {number} number
 * @returns {boolean} true on success (or no-op).
 */
export function unclaimIssue(number) {
  if (!hasToken()) return false;
  const res = gh(["issue", "edit", String(number), "--remove-label", "in-progress"]);
  if (!res.ok) {
    // `--remove-label` on an issue that doesn't have the label is a soft failure;
    // log but don't treat it as fatal — the goal state (no in-progress) holds.
    console.log(`issues: unclaim no-op for #${number} — ${res.stderr.trim()}`);
    return false;
  }
  return true;
}

/**
 * Close an issue as done, optionally leaving a closing comment. Closed = the
 * actor completed the work. (On FAILURE, an actor should instead leave the
 * issue OPEN and comment, so it retries next run — see the doc's lifecycle.)
 *
 * @param {number} number
 * @param {string} [comment]
 * @returns {boolean} true on success (or no-op).
 */
export function closeIssue(number, comment) {
  if (!hasToken()) return false;
  const args = ["issue", "close", String(number)];
  if (comment) args.push("--comment", comment);
  const res = gh(args);
  if (!res.ok) {
    console.log(`issues: close failed for #${number} (${res.status}) — ${res.stderr.trim()}`);
    return false;
  }
  return true;
}
