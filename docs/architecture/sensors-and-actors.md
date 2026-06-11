# Sensors & Actors

How the farm's automation is organized. The site already does this once — the
notebook scout reads activity and files idea-seed issues; the field-notes job
consumes those issues and publishes a note. This document generalizes that one
pairing into a **paradigm** and names the shared contract that lets future
pairs reuse it.

## The model: sense → issue → act

A **sensor** turns external input (repo activity, freshness, an inbound
inquiry) into discrete, labeled, schema'd **work items**. An **actor** consumes
those work items and makes a change (a commit, a published page, an external
side effect), then closes them. The two are **decoupled** — neither imports nor
schedules the other. They share only a **GitHub label** (the work-item type)
and a **hidden body marker** (the payload schema).

```
  external input                 work queue                  effect
  ───────────────            ──────────────────          ──────────────
                             ┌──────────────────┐
   repo activity ─▶ SENSOR ─▶│  GitHub issues   │─▶ ACTOR ─▶ commit / page
   freshness     ─▶  (emit)  │  label = type    │  (claim/   external call
   inbound msg   ─▶          │  body = schema'd │   close)
                             └──────────────────┘
        producers                  (decoupled)              consumers
```

The queue is durable, observable, and human-editable: an open issue is a
pending task you can read, comment on, re-label, or close by hand. No bespoke
store, no cron coupling — the issue lifecycle *is* the state machine.

## Issues as the work queue

- **Producers (sensors)** open issues: ensure the type's label exists, write a
  human-readable body, and append the hidden marker carrying the structured
  payload. They dedup against the currently-open issues so they never file the
  same item twice.
- **Consumers (actors)** read the queue: list open issues for their label,
  recover the payload from the marker, claim what they take, do the work, and
  close on success. On failure they leave the issue open and comment, so it
  retries.

The shared code for this lives in [`scripts/lib/issues.mjs`](../../scripts/lib/issues.mjs)
— `buildMarker` / `parseMarker`, `dedupeBy`, `ensureLabel`, `emitIssue`,
`listOpenIssues`, `claimIssue`, `closeIssue`.

## Label taxonomy (the type system)

The label *is* the work-item type. One actor owns each label; one or more
sensors may produce it.

| Label | Producer (sensor) | Consumer (actor) | Status |
|-------|-------------------|------------------|--------|
| `field-note-seed` | notebook scout | field-notes | **exists** |
| `inquiry` | MCP server / inquiry form | (humans, in `rarebit-ops`) | **exists** |
| `voice-proposal` | frontier-lab voice sensor | voice actor | planned |
| `drift` | freshness sensor | drift actor | planned |
| `task` | any sensor | a generic task runner | future / generic |

`inquiry` already lives in `rarebit-one/rarebit-ops` (opened by the MCP server
and the inquiry form) — proof the pattern predates this doc; here it's a
producer whose consumer is a human, not an automated actor.

## Body schema: the hidden marker

Every work item embeds a single trailing HTML comment so the payload
round-trips reliably regardless of how the body prose is edited:

```
<!-- <type>:{json} -->
```

This generalizes the notebook's existing `<!-- seed:{"angle":…,"grounding":[…]} -->`.
`buildMarker(type, data)` emits it; `parseMarker(body[, type])` recovers
`{ type, data }`, returning `null` when absent or malformed so the consumer can
fall back to scraping the title/body. The JSON is single-line so the match stays
a simple regex and the marker occupies one trailing line, invisible in rendered
Markdown.

## Lifecycle

| State | Meaning |
|-------|---------|
| **open** | pending — a candidate the actor hasn't taken yet |
| **open + claimed** | an actor has taken it: label `in-progress` (or an assignee) prevents a second run from double-processing |
| **closed** | done — the actor completed the work |
| **open + comment** (after a failed attempt) | the actor hit an error; it left the issue open and commented, so the next run retries |

Claiming matters because actors run on schedules and may overlap; `claimIssue`
marks an item taken before the slow work begins. Success closes; failure never
closes — the queue self-heals by retrying open items. `closeIssue` leaves the
`in-progress` label in place: a closed issue is terminal, and actors only ever
query the *open* set, so the label needs no cleanup once closed.

## Two firm boundaries

1. **Telemetry ≠ work items.** Continuous, regenerable streams — like
   farm-feed's per-category metrics — stay as **bucket artifacts** (DO Spaces),
   *not* issues. The queue is for *discrete tasks that something should act on*,
   not for a metrics firehose. (This mirrors the workspace
   `cognition-artifacts` rule: decisions → git, coordination → issues,
   raw/regenerable data → a bucket.) A sensor may *read* telemetry and, from it,
   emit a small number of work-item issues — but the stream itself never becomes
   issues.

2. **The issue queue is the trust boundary.** A sensor MUST pass its
   sanitization / safety gate **before** it emits. Anything that lands in an
   issue is therefore already "cleared" — actors trust the queue and do not
   re-sanitize. This is why the notebook runs `validate.mjs` *before*
   `publish.mjs` files seed issues: no unsanitized angle ever reaches a public
   issue. New sensors inherit this rule — gate first, emit second.

## Current-state mapping

| Workflow / job | Role | Notes |
|----------------|------|-------|
| notebook (`scripts/notebook/`) | **sensor** | reads public activity → `field-note-seed` issues (gated by its `validate.mjs`) |
| field-notes (`scripts/field-notes/`) | **actor** | consumes `field-note-seed` issues → publishes a note |
| inquiry / MCP (`functions/packages/mcp/`) | **sensor** | inbound message → `inquiry` issue in `rarebit-ops` |
| farm-feed (`scripts/farm-feed/`) | **telemetry sensor → bucket** | metrics stream → DO Spaces artifact (NOT issues — boundary #1) |
| voice-evolution | **coupled sense + act** | senses *and* mutates voice in one job — a split candidate |
| site-freshness | **coupled sense + act** | senses staleness *and* edits in one job — a split candidate |
| auto-land + review-verdict | **shared effect / quality rail** | the common landing + review lane all actors funnel through |

## Next steps (describe only — not built here)

Both coupled jobs above bundle sensing and acting in a single workflow. The plan
is to **split** each into a sensor/actor pair communicating over the
[`issues.mjs`](../../scripts/lib/issues.mjs) contract:

- **`voice-evolution` → `voice-sensor` + `voice-actor`.** The sensor detects a
  warranted voice change and emits a `voice-proposal` issue (payload =
  proposed change + grounding); the actor consumes it, applies the edit, and
  closes.
- **`site-freshness` → `drift-sensor` + `drift-actor`.** The sensor detects
  stale content and emits a `drift` issue (payload = what's stale + why); the
  actor consumes it, refreshes the page, and closes.

The **first concrete step** is this foundation: the paradigm doc (here) and the
shared `scripts/lib/issues.mjs` contract. The notebook/field-notes pair will be
**retrofitted** onto `issues.mjs` next (replacing its inline `seed:` marker
logic), and only then will the voice/freshness splits be built. All of that is
additive to what exists today — this foundation changes no current behavior.
