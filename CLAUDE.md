# CLAUDE.md — rarebit-static-v3

The v3 marketing site for **rarebit.one**. The Brainwave (UI8) theme that powered v1, rebuilt on
the v2 tech stack (Astro). Replaces `rarebit-static-v2` (bespoke cyberpunk-watercolor design,
abandoned) and `rarebit-static` (v1, the original Brainwave React-Router SPA).

## Stack

- **Astro** (`output: 'static'`) + **Tailwind 4** (CSS-first `@theme` in `src/styles/global.css`)
- **Zero JS frameworks** — only small vanilla scripts: the mobile nav toggle (`Header.astro`),
  the Benefits carousel dots (`Benefits.astro`), and the copy buttons on `/connect`. Template
  animations were replaced with CSS: react-just-parallax → CSS keyframes, and the Splide
  carousel → a CSS scroll-snap track (`no-scrollbar` utility in `global.css`)
- Self-hosted `@fontsource` fonts: Sora / Source Code Pro / Space Grotesk (the Brainwave trio)
- Node 20+ (`.nvmrc` pins 22); `vite` is pinned as a direct dep so `@tailwindcss/vite` dedupes
  to Astro's vite major — removing it breaks `astro check`

## Commands

```bash
npm run dev      # localhost:4321
npm run build    # → dist/
npm run check    # astro check (run before shipping)
npm run preview  # serve dist/
```

## Conventions

- **The theme is Brainwave, with brand accents.** Palette (`color-1..6`, `n-1..8`, `stroke-1`),
  type scale (`.h1`–`.h6`, `.body-1/2`, `.tagline`, `.button`), and section chrome (crosses,
  side rails, conic-gradient borders) are ported 1:1 from the v1 Tailwind 3 config into
  `global.css` `@theme`/`@layer components`. Brand colors from `docs/brand-guide.png`
  (`brand-magenta` #FF0F8A, `brand-cyan` #00E8FF) are layered on deliberately: **magenta** for
  interactive states (link/button hovers, list markers via `images/rarebit/check.svg`),
  **cyan** for code/identifiers (MCP endpoint, tool names) and card-border hovers. Structural
  chrome stays template-neutral; brand imagery lives in `public/images/rarebit/`.
- **Tailwind 4 porting traps** (the template was Tailwind 3): the core `container` utility
  outranks `@layer components` — ours is redefined via `@utility container` in `global.css`;
  and `.inline-flex` sorts after `.hidden`, so `hidden lg:flex` on `Button` never hides — use
  `max-lg:hidden` instead.
- **Copy centers on the AI automation farm** — AI adoption work, workflow automation, agents with
  humans in the loop. **Never name clients.** Brand voice from `docs/brand-guide.png`: taglines
  like "Small Teams. Impossible Things." / "Human Creativity. Amplified."
- **Content lives in `src/data/site.ts`** (nav, stats, benefits, collaboration, roadmap, contact)
  and `src/data/openSource.data.mjs` (the /open-source catalog — plain JS so scripts can import
  it; `openSource.ts` is its typed wrapper; descriptions verbatim from v2's source-of-truth
  copy). The MCP server's `open_source` canned content is **generated** from the catalog via
  `npm run sync:mcp` (markers in `functions/.../server/index.mjs`; CI fails on drift) — edit
  the data, never the generated block.
- **Build-time farm data** (`src/lib/farm.ts`): hero stats, Operations receipts, gem
  versions/downloads, and the footer stamp are fetched from public GitHub/RubyGems APIs at
  build, memoized per process, with static fallbacks — a flaky API must never break the build,
  and the stats strip falls back to the all-playful set rather than mixing real labels with
  fake numbers ("Managers: 0" stays obviously tongue-in-cheek). `weekly-rebuild.yml` forces a
  DO rebuild Mondays 06:00 SGT to keep the numbers fresh; `site-quality.yml` runs link checks
  (blocking) and Lighthouse (advisory) on PRs. The link check excludes our own `rarebit.one`
  domain from the network probe — a PR's new pages 404 on prod until they deploy, and the
  POST-only `/mcp` returns 405 to a GET; root-relative links are still validated against `dist`.
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
  (`rarebit-farm-feed`, channel from the `FARM_FEED_CHANNEL` repo var — `staging` until trusted,
  then `live`). The site reads it at build (`farmReplay()` → SSR digest line in Operations, with
  a freshness guard: only shown if the file's `window` is within the last two days SGT) and in the
  browser: the Operations client script replays each event into the receipts list on a fixed
  real-time + 24h delay (`Δ24h` rows), refreshing the digest and hiding it when the artifact is
  stale (`window` ≠ yesterday-SGT) or absent. **Invariants, do not weaken:** the LLM phrases, it
  does not redact; the validator is the gate; nothing is shown sooner than 24h. The gate is locked
  by `scripts/farm-feed/validate.test.mjs` (run via `npm test` in CI) — keep it green. Secrets
  (user-created): `FEED_GITHUB_PAT`, `OPENAI_API_KEY`, `SPACES_KEY_ID`, `SPACES_SECRET` — each
  missing one no-ops its step so the workflow stays green until wired up. **Dormant until the
  bucket has data** (the client script no-ops on a 404; the SSR receipts + digest stand alone).
- **Legal footer** (name, UEN, registered address) mirrors `rarebit-ops` `entity/profile.yml` —
  that file is the source of truth; update here when ACRA details change.
- **Contact is MCP-first, form-fallback.** All CTAs route to `/connect`, which documents the
  MCP endpoint (`https://rarebit.one/mcp`) and carries an inquiry form for users who can't add
  an MCP connector (assistants only allow that on web/desktop, so mobile needs the form); email
  is the last resort. Both are DO Functions in the same app under `functions/packages/mcp/`:
  `server/index.mjs` (zero-dependency Streamable HTTP JSON-RPC, canned content +
  `submit_inquiry`) and `inquiry/index.mjs` (plain POST for the form, ingress `/inquiry`).
  Both open a labeled `inquiry` issue in `rarebit-one/rarebit-ops` and need `GITHUB_TOKEN`
  (fine-grained PAT, Issues read/write on rarebit-ops only) + `GITHUB_REPO` env vars at runtime
  (declared in `functions/project.yml`). Smoke-test locally by importing `main` and posting
  envelopes. The MCP server's `open_source` canned content mirrors the /open-source page —
  keep them in sync. NB: app-spec changes (`.do/app.yaml` — ingress, envs) don't apply on
  push, and **never apply that file raw**: `doctl apps update --spec` is a full-spec replace
  and the committed file deliberately omits the GITHUB_TOKEN secret — applying it verbatim
  wipes the token and breaks all subsequent deploys. Merge changes into the live spec
  (`doctl apps spec get`) instead; see the warning header in `.do/app.yaml`.
- **Shared SVG gradient defs** (`#btn-*`, `#brackets-*`) live once in `Layout.astro`; Button and
  Tagline reference them by id. The Benefits clip-path (`#benefits`) lives in `Benefits.astro`.
- **Field notes** (`/field-notes`) are an Astro content collection
  (`src/content/field-notes/*.md`, schema in `src/content.config.ts`) with RSS at `/rss.xml`;
  the old `/notes` paths redirect (an in-flight PR handles the rename + redirects). Only
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
  on any private blocklist identifier, off-allowlist URL, email/@handle, or dead internal link,
  no-ops a thin week, and writes the markdown. Locked by
  `validate.test.mjs` (run via `npm test` in CI). Instead of pushing to main, the workflow
  commits the note to a branch `field-notes/<slug>` and opens an `auto-land`-labeled PR via
  `AUTOLAND_PAT` (so CI + `review/clear` run); the gated auto-land sweeper merges it once green
  (see "Gated auto-land" below). Secrets (user-created): `FEED_GITHUB_PAT`,
  `OPENAI_API_KEY` (model = `OPENAI_MODEL` repo var, default `gpt-4o`), `AUTOLAND_PAT` — each
  missing one no-ops its step so the workflow stays green until wired up. `/privacy` documents
  the no-trackers stance and inquiry-data handling — keep it true (adding any analytics/tracker
  requires updating it). `public/llms.txt` is the AI-readable site summary; keep it in step
  with the page list.
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
- **Motion is CSS-only** and gated behind `prefers-reduced-motion` (orb floats, caret blink,
  scroll-driven `.reveal` entrances in `global.css`).
- Template raster/SVG assets under `public/images/` come from the Brainwave UI8 kit (licensed via
  the v1 purchase); brand assets under `public/images/rarebit/`.

## Gated auto-land (scoped exception to workspace Rule #7)

PRs in **this repo only** can auto-merge once reviewed + green, with no human merge step. This is
a **deliberate, scoped exception** to workspace `CLAUDE.md` Rule #7 ("agents never merge PRs
autonomously"); that rule remains in full force in every other repo. The exception lives entirely
in this repo's settings + workflows — nothing here changes how `/ship`, `/land`, or `/release`
behave elsewhere. Tracked in issue #29.

- **`.github/workflows/review-verdict.yml`** (+ `.github/scripts/review-verdict.mjs`) — the
  binding, repo-local review gate. On every PR push it sends the diff to the OpenAI API (via the
  shared `scripts/lib/llm.mjs` helper; model = `OPENAI_MODEL` repo var, default `gpt-4o`) with a
  strict rubric and records the verdict as commit status **`review/clear`**. It blocks ONLY on
  correctness/security/build-type issues or repo invariant violations (leaked client/private
  identifiers, off-brand voice, fabricated metrics) — never style nitpicks. **Fail closed:** any
  error (missing `OPENAI_API_KEY`, API failure, unparseable response) sets `failure`, never
  `success`. The separate org-level `claude-code-review.yml` stays as informal commentary — it is
  NOT the gate.
- **`.github/workflows/auto-land.yml`** (+ `.github/scripts/auto-land.mjs`) — the event-driven
  sweeper. A PR is eligible iff it has label `auto-land`, is not a draft, lacks `hold`/
  `no-auto-land`, has no trusted `STOP` comment after the latest commit, is `MERGEABLE`, and has
  ALL required contexts green: **`Type-check & build`**, **`Link check`**, **`review/clear`**
  (advisory **`Lighthouse (advisory)`** is intentionally NOT required). Eligibility keys on the
  **label**, not author identity. Merges (squash + delete-branch) use `AUTOLAND_PAT` (a real-user
  token) so downstream CI/deploy `workflow_run` jobs fire. **DRY-RUN unless repo var
  `AUTOLAND_LIVE == "true"`** — until flipped, it logs `would land #N` and merges nothing.
- **`scripts/autoland/enable.sh`** — the ONE place repo-settings changes are described (labels +
  `main` branch protection requiring the three contexts above, `required_pull_request_reviews:
  null`, `required_conversation_resolution: true`). Run once by a human after `AUTOLAND_PAT` is
  set; it is never executed by any workflow. The go-live one-liner
  (`gh variable set AUTOLAND_LIVE --body true`) lives at its bottom.
- **`field-notes.yml`** rides this lane: instead of pushing the weekly note to main, it opens an
  `auto-land` PR (branch `field-notes/<slug>`, pushed + created via `AUTOLAND_PAT`) so CI +
  `review/clear` run, then the sweeper merges it.

**Future agents: do NOT "fix" `auto-land.yml` or `field-notes.yml`'s PR-path (or this section) as
a Rule #7 governance violation.** It is intentional and scoped to this repo. If you think it's
wrong, raise it with the owner via issue #29 — don't revert it.

This is a separate git repo in the `rarebit-one` org — `cd` here before git ops. Worktree-only
workflow and signed commits per the workspace CLAUDE.md.
