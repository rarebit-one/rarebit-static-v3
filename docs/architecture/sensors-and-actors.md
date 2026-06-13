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
`listOpenIssues`, `claimIssue`, `unclaimIssue`, `closeIssue`.

## Label taxonomy (the type system)

The label *is* the work-item type. One actor owns each label; one or more
sensors may produce it.

| Label | Producer (sensor) | Consumer (actor) | Status |
|-------|-------------------|------------------|--------|
| `field-note-seed` | notebook scout | field-notes | **exists** (retrofitted onto `issues.mjs`, #56) |
| `inquiry` | MCP server / inquiry form | (humans, in `rarebit-ops`) | **exists** |
| `voice-proposal` | voice sensor (`voice-sensor.yml`) | voice actor (`voice-actor.yml`) | **exists** (#56) |
| `drift` | drift sensor (`drift-sensor.yml`) | drift actor (`drift-actor.yml`) | **exists** (#56) |
| `task` | any sensor | a generic task runner | future / generic |

`in-progress` is not a work-item type — it is the **claim** marker an actor adds
to an open issue (any type) before it begins the slow work, so an overlapping run
won't double-process it. `claimIssue` adds it; `unclaimIssue` removes it when an
actor took an item but then no-op'd / the gate rejected, releasing it for retry.

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
| notebook (`scripts/notebook/`) | **sensor** | reads public activity → `field-note-seed` issues (gated by its `validate.mjs`); emits + dedups via `issues.mjs` (#56) |
| field-notes (`scripts/field-notes/`) | **actor** | consumes `field-note-seed` issues (marker recovered via `parseMarker`) → publishes a note |
| inquiry / MCP (`functions/packages/mcp/`) | **sensor** | inbound message → `inquiry` issue in `rarebit-ops` |
| farm-feed (`scripts/farm-feed/`) | **telemetry sensor → bucket** | metrics stream → DO Spaces artifact (NOT issues — boundary #1) |
| voice-sensor (`scripts/voice/sense.mjs`) | **sensor** | frontier-lab signal → one deduped `voice-proposal` issue (#56) |
| voice-actor (`scripts/voice/act.mjs`) | **actor** | claims a `voice-proposal` → existing draft + bounded-diff gate → `auto-land` PR (#56) |
| drift-sensor (`scripts/freshness/sense.mjs`) | **sensor** | worktree capability signals → one deduped `drift` issue (#56) |
| drift-actor (`scripts/freshness/act.mjs`) | **actor** | claims a `drift` → re-gather + existing draft + byte-for-byte gate → `auto-land` PR (#56) |
| auto-land + review-verdict | **shared effect / quality rail** | the common landing + review lane all actors funnel through |

## What was built (#56)

The foundation (this doc + the `issues.mjs` contract) and all three realizations
now exist:

- **notebook/field-notes — retrofitted.** `scripts/notebook/publish.mjs` (sensor)
  and `scripts/field-notes/gather.mjs` (actor) dropped their inline `<!-- seed:{…} -->`
  marker + dedup in favour of `issues.mjs` (`ensureLabel` / `listOpenIssues` /
  `parseMarker` / `emitIssue`). Behaviour is unchanged: same `field-note-seed`
  label, the marker TYPE token stays `seed` (so `buildMarker("seed", …)` is
  byte-identical to the old inline marker and pre-existing open seeds still parse
  and dedup), and the dedup key stays the primary grounding URL. Locked by
  `scripts/notebook/publish.test.mjs`.
- **`voice-evolution` → `voice-sensor` + `voice-actor`.** The sensor
  (`scripts/voice/sense.mjs`, `voice-sensor.yml`) reads this week's public signal
  and emits ONE deduped `voice-proposal` issue carrying that signal; it edits
  nothing. The actor (`scripts/voice/act.mjs`, `voice-actor.yml`) claims the
  issue, reconstructs the signal, runs the UNCHANGED `draft.mjs` + the #54
  bounded-diff `validate.mjs`, and opens an `auto-land` PR that `Closes` the issue
  on merge. A no-op / rejected gate releases the claim (`unclaimIssue`) for retry.
- **`site-freshness` → `drift-sensor` + `drift-actor`.** The sensor
  (`scripts/freshness/sense.mjs`, `drift-sensor.yml`) reads the worktree's
  capability signals and emits ONE deduped `drift` issue. The actor
  (`scripts/freshness/act.mjs`, `drift-actor.yml`) claims it, re-gathers fresh
  worktree state, runs the UNCHANGED `draft.mjs` + the byte-for-byte `validate.mjs`,
  and opens an `auto-land` PR that `Closes` the issue on merge; a no-op releases
  the claim.

Each split's gate is **reused verbatim** — the validators remain the sole
pre-publish gates, the trust boundary holds (sensors gate before they emit; the
voice/drift sensors carry only public, non-identifier signal), and farm-feed
stays a bucket, never an issue (boundary #1). The new labels (`voice-proposal`,
`drift`, `in-progress`) are documented in `scripts/autoland/enable.sh` and
`ensureLabel`d at runtime so a missing label never errors.
