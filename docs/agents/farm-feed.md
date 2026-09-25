# Client-work replay lane (farm-feed)

Moved verbatim from the old `CLAUDE.md` ("Conventions"); the rules that must hold are summarised in [`AGENTS.md`](../../AGENTS.md).

- **Client-work replay lane** — a nightly pipeline (`scripts/farm-feed/`, `farm-feed.yml`,
  00:30 SGT) replays yesterday's private-repo activity on a fixed 24h delay as anonymized,
  generic-language rows. It's a strict **gather → phrase → validate** sandwich: `gather.mjs`
  reduces private workflow runs to category counts + timestamps **inside the script** (repo
  names, branches, logins never leave it); `phrase.mjs` makes the **one** LLM call
  (one OpenAI chat-completions call via `scripts/lib/llm.mjs`; model = `OPENAI_MODEL` repo var,
  default `gpt-4o`) producing only a digest line + generic per-category templates — it never
  sees raw data or emits identifiers; `validate.mjs` is a hard gate that **exit-1s on any
  blocklisted name, URL, email, @handle, or number absent from the sanitized totals**, then
  assembles the artifact. Output publishes (`aws s3 cp`) to a DO Spaces bucket
  (`rarebit-farm-feed`) at a **single public path** — `farm-replay.json` plus
  `archive/<YYYY-MM-DD>.json`, both uploaded `--acl public-read`, so **everything the pipeline
  writes is published the instant it lands**. There is no holding area and no promotion step:
  `validate.mjs` runs before the upload and is the sole pre-publication gate. (A
  `staging`/`live` channel split once claimed to be one — "staging until trusted" — but both
  prefixes were public-read and the site read `staging` by default, so it gated nothing;
  removed in #344. Do not reintroduce a path prefix as a trust boundary.) The site reads it at
  build (`farmReplay()` → SSR digest line in Operations, with
  a freshness guard: only shown if the file's `window` is within the last two days SGT) and in the
  browser: the Operations client script replays each event into the receipts list on a fixed
  real-time + 24h delay (`Δ24h` rows), refreshing the digest and hiding it when the artifact is
  stale (`window` ≠ yesterday-SGT) or absent. **Invariants, do not weaken:** the LLM phrases, it
  does not redact; the validator is the gate; nothing is shown sooner than 24h. The gate is locked
  by `scripts/farm-feed/validate.test.mjs` (run via `npm test` in CI) — keep it green. Secrets
  (user-created): `FEED_GITHUB_PAT`, `OPENAI_API_KEY`, `SPACES_KEY_ID`, `SPACES_SECRET` — each
  missing one no-ops its step so the workflow stays green until wired up. **Dormant until the
  bucket has data** (the client script no-ops on a 404; the SSR receipts + digest stand alone).
