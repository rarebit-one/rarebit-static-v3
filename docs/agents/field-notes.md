# Field notes pipeline

Moved verbatim from the old `CLAUDE.md` ("Conventions"); the rules that must hold are summarised in [`AGENTS.md`](../../AGENTS.md).

- **Field notes** (`/field-notes`) are an Astro content collection
  (`src/content/field-notes/*.md`, schema in `src/content.config.ts`) with RSS at `/rss.xml`;
  the old `/notes` paths redirect. Only
  verifiable claims (public PRs, real data) — never invent metrics. Weekly entries are
  **agent-drafted and auto-published** behind the validation gate (below); manually authored
  notes remain human-reviewed. A weekly pipeline (`scripts/field-notes/`, `field-notes.yml`,
  Mon 06:00 SGT) auto-drafts and AUTO-PUBLISHES a note, mirroring farm-feed's
  gather→draft→validate sandwich: `gather.mjs` collects the last 7 days — PUBLIC repo
  PRs/releases in full, linkable detail; PRIVATE work reduced to anonymized category counts
  **inside the script** (names/logins never leave it, only the `blocklist`). `draft.mjs` makes
  the one LLM call (one OpenAI chat-completions call via `scripts/lib/llm.mjs`; model =
  `OPENAI_MODEL` repo var, default `gpt-4o`) grounded only in those facts; it can link back to past
  notes. `validate.mjs` is the **SOLE pre-publish gate** (no human in the loop): it hard-fails
  on any private blocklist identifier, off-allowlist URL, email/@handle, dead internal link, or
  hype term VOICE.md bans **by name** (plus exclamation marks/emoji — each exempt when quoted
  from a fact the drafter was given), no-ops a thin week, and writes the markdown. That lexicon
  gate covers only VOICE.md's closed, enumerated list; the softer promotional framing it can't
  regex ("significant", "solidifies", benefit clauses bolted onto a fact) is handled by
  `draft.mjs`'s prompt and the `review/clear` gate — do not widen the regex into ordinary
  English, it will start rejecting whole weeks. Locked by
  `validate.test.mjs` (run via `npm test` in CI). Instead of pushing to main, the workflow
  commits the note to a branch `field-notes/<slug>` and opens an `auto-land`-labeled PR via
  `AUTOLAND_PAT` (so CI + `review/clear` run); the gated auto-land sweeper merges it once green
  (see "Gated auto-land" below). **The commit is made by `scripts/lib/publish-commit.mjs`
  (GraphQL `createCommitOnBranch`) — shared with `drift-actor.yml` and `voice-actor.yml` — never by `git commit` — `main` requires signed commits and a
  runner has no key, so a git-made commit leaves the PR `blocked` with every required check GREEN
  and nothing red to point at. GraphQL is the only GitHub API that signs; the REST contents API
  does NOT. Do not "simplify" this back to `git commit && git push`.** Secrets (user-created): `FEED_GITHUB_PAT`,
  `OPENAI_API_KEY` (model = `OPENAI_MODEL` repo var, default `gpt-4o`), `AUTOLAND_PAT` — each
  missing one no-ops its step so the workflow stays green until wired up. `/privacy` documents
  the no-trackers stance and inquiry-data handling — keep it true (adding any analytics/tracker
  requires updating it). `public/llms.txt` is the AI-readable site summary; keep it in step
  with the page list.
