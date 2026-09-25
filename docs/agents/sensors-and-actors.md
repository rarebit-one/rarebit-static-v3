# Sensors and actors over the issue queue

Moved verbatim from the old `CLAUDE.md` ("Conventions"); the rules that must hold are summarised in [`AGENTS.md`](../../AGENTS.md). Design doc: [`docs/architecture/sensors-and-actors.md`](../architecture/sensors-and-actors.md).

- **Sensors & actors over the issue queue** (`docs/architecture/sensors-and-actors.md`,
  issue #56). The farm's automation is decoupled producer/consumer pairs that talk only through
  labeled, schema'd GitHub issues — never by importing each other. A **sensor** turns external
  input into a labeled, marker-carrying issue (it gates BEFORE it emits — the queue is the trust
  boundary); an **actor** lists open issues for its label, claims one (`in-progress`), does the
  bounded work behind its validator, opens an `auto-land` PR, and the issue `Closes` on merge (a
  no-op/rejected gate releases the claim for retry). The shared contract is
  `scripts/lib/issues.mjs` (`buildMarker`/`parseMarker`/`dedupeBy`/`ensureLabel`/`emitIssue`/
  `listOpenIssues`/`claimIssue`/`unclaimIssue`/`closeIssue`) — pure helpers unit-tested in
  `issues.test.mjs`. Three pairs exist: **notebook → field-notes** (`field-note-seed`; the
  notebook publisher's marker TYPE stays `seed`, byte-identical to its pre-retrofit inline marker,
  so existing open seeds still parse/dedup), **voice-sensor → voice-actor** (`voice-proposal`;
  reuses the #54 bounded-diff voice gate), and **drift-sensor → drift-actor** (`drift`; reuses the
  byte-for-byte freshness gate). New labels (`voice-proposal`, `drift`, `in-progress`) live in
  `scripts/autoland/enable.sh` and are `ensureLabel`d at runtime. **Two firm boundaries:**
  telemetry ≠ work items (farm-feed stays a DO Spaces bucket, NEVER issues), and the validators
  stay the sole pre-publish gates — do not weaken either.
