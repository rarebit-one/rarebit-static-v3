# AGENTS.md — rarebit-static-v3

The v3 marketing site for **rarebit.one**. The Brainwave (UI8) theme that powered v1, rebuilt on
the v2 tech stack (Astro). Replaces `rarebit-static-v2` (bespoke cyberpunk-watercolor design,
abandoned) and `rarebit-static` (v1, the original Brainwave React-Router SPA).

Long-form agent notes live in `docs/agents/`; design docs in `docs/architecture/`.

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
npm test         # node --test over scripts/**/*.test.mjs (the pipeline gates)
npm run sync:mcp # regenerate the MCP server's open_source block from the catalog
```

## Conventions

- **The theme is Brainwave, with brand accents** (palette, type scale and section chrome ported
  1:1 into `src/styles/global.css`; **magenta** for interactive states, **cyan** for
  code/identifiers). Detail: [`docs/agents/brand-theme.md`](docs/agents/brand-theme.md).
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
  `npm run sync:mcp` (markers in `functions/packages/mcp/server/index.mjs`; CI fails on drift) — edit
  the data, never the generated block.
- **Build-time farm data** (`src/lib/farm.ts`) comes from public GitHub/RubyGems APIs with
  static fallbacks — a flaky API must never break the build, and never mix real labels with
  fake numbers. Detail (rebuild cron, link-check exclusions):
  [`docs/agents/farm-data.md`](docs/agents/farm-data.md).
- **Client-work replay lane** (`scripts/farm-feed/`, nightly) — a **gather → phrase → validate**
  sandwich that publishes to a public-read DO Spaces bucket the instant it uploads.
  **Invariants, do not weaken:** the LLM phrases, it
  does not redact; the validator is the gate; nothing is shown sooner than 24h. The gate is locked
  by `scripts/farm-feed/validate.test.mjs` (run via `npm test` in CI) — keep it green.
  Do not reintroduce a path prefix as a trust boundary. Full design:
  [`docs/agents/farm-feed.md`](docs/agents/farm-feed.md).
- **Legal footer** (name, UEN, registered address) mirrors rarebit-ops entity/profile.yml —
  that file is the source of truth; update here when ACRA details change.
- **Contact is MCP-first, form-fallback** (`/connect`; DO Functions under `functions/packages/mcp/`).
  **Never apply `.do/app.yaml` raw**: `doctl apps update --spec` is a full-spec replace
  and the committed file deliberately omits the GITHUB_TOKEN secret — applying it verbatim
  wipes the token and breaks all subsequent deploys. Merge changes into the live spec
  (`doctl apps spec get`) instead; see the warning header in `.do/app.yaml`. Detail:
  [`docs/agents/contact-mcp.md`](docs/agents/contact-mcp.md).
- **Shared SVG gradient defs** (`#btn-*`, `#brackets-*`) live once in `Layout.astro`; Button and
  Tagline reference them by id. The Benefits clip-path (`#benefits`) lives in `Benefits.astro`.
- **Field notes** (`src/content/field-notes/*.md`) — only verifiable claims (public PRs, real
  data), never invent metrics. The weekly pipeline (`scripts/field-notes/`) auto-publishes
  behind `scripts/field-notes/validate.mjs`, the **SOLE pre-publish gate** — do not widen its
  regex into ordinary English, it will start rejecting whole weeks. **The commit is made by
  `scripts/lib/publish-commit.mjs` (GraphQL `createCommitOnBranch`), never by `git commit`** —
  `main` requires signed commits and a runner has no key, so a git-made commit leaves the PR
  `blocked` with every check green. Full pipeline:
  [`docs/agents/field-notes.md`](docs/agents/field-notes.md).
- `/privacy` documents the no-trackers stance and inquiry-data handling — keep it true (adding
  any analytics/tracker requires updating it). `public/llms.txt` is the AI-readable site
  summary; keep it in step with the page list.
- **Sensors & actors over the issue queue** — automation pairs talk only through labeled GitHub
  issues (contract: `scripts/lib/issues.mjs`). **Two firm boundaries:**
  telemetry ≠ work items (farm-feed stays a DO Spaces bucket, NEVER issues), and the validators
  stay the sole pre-publish gates — do not weaken either. Detail:
  [`docs/agents/sensors-and-actors.md`](docs/agents/sensors-and-actors.md).
- **Motion is CSS-only** and gated behind `prefers-reduced-motion` (orb floats, caret blink,
  scroll-driven `.reveal` entrances in `global.css`).
- Template raster/SVG assets under `public/images/` come from the Brainwave UI8 kit (licensed via
  the v1 purchase); brand assets under `public/images/rarebit/`.

## Gated auto-land (in-repo automation of Rule 5)

PRs here auto-merge once reviewed + green, with no manual merge step. This automates workspace
`AGENTS.md` Rule 5 (merge on green) via repo settings + workflows; it is not a contradiction of
it. Full description: [`docs/agents/auto-land.md`](docs/agents/auto-land.md). Tracked in issue #29.

- **`review/clear`** (`.github/workflows/review-verdict.yml` + `.github/scripts/review-verdict.mjs`)
  is the binding review gate: an **OpenAI** call (`scripts/lib/llm.mjs`) with a strict rubric.
  **Fail closed:** any
  error (missing `OPENAI_API_KEY`, API failure, unparseable response) sets `failure`, never
  `success`. The org-level `.github/workflows/claude-code-review.yml` is informal commentary —
  NOT the gate.
- **`.github/workflows/auto-land.yml`** merges PRs labelled `auto-land` once `Type-check & build`,
  `Link check` and `review/clear` are green (Lighthouse is advisory). **DRY-RUN unless repo var
  `AUTOLAND_LIVE == "true"`.**
- **`scripts/autoland/enable.sh`** — the ONE place repo-settings changes are described; run by a
  human, never by a workflow.

**Future agents: do NOT "fix" `auto-land.yml` or `field-notes.yml`'s PR-path (or this section) as
a Rule 5 governance violation.** If you think it's wrong, raise it with the owner
via issue #29 — don't revert it.

This is a separate git repo in the `rarebit-one` org — `cd` here before git ops. Worktree-only
workflow and signed commits per the workspace `AGENTS.md`.
