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
  (blocking) and Lighthouse (advisory) on PRs. The Operations receipts also upgrade client-side
  into a **live feed**: the visitor's browser polls the public org-events API (CORS, ETag
  conditional requests — 304s are rate-limit-free, paused when the tab is hidden) and renders
  anonymized rows — actors become agent/operator chips; only event type + repo + number are
  shown, never usernames, titles, or emails. Private-repo activity can't appear by
  construction (unauthenticated API). The SSR receipts remain the no-JS fallback. NB: the
  org-events payloads are slim (no html_url, no merged flag, no push sizes) — URLs are
  constructed, and closed PRs say "closed", never "merged".
- **Client-work replay lane** — the Operations feed also interleaves a `client` lane that
  **replays yesterday's private-repo activity on a fixed 24h delay** (disclosed in the lane
  header + a `Δ24h` row marker, like a delayed market ticker). A nightly pipeline
  (`scripts/farm-feed/`, `farm-feed.yml`, 00:30 SGT) is a strict **gather → phrase → validate**
  sandwich: `gather.mjs` reads private workflow runs and reduces them to category counts +
  timestamps **inside the script** (repo names, branches, logins never leave it); `phrase.mjs`
  makes the **one** LLM call (`claude-haiku-4-5`) producing only a digest line + generic
  per-category phrase templates — it never sees raw data or emits identifiers; `validate.mjs`
  is a hard gate that **exit-1s on any blocklisted name, URL, email, @handle, or number absent
  from the sanitized totals**, then assembles the artifact from the validated templates. Output
  publishes to a DO Spaces bucket (`rarebit-farm-feed`, channel from the `FARM_FEED_CHANNEL`
  repo var — `staging` until trusted, then `live`); the site reads it at build (`farmReplay()`
  → SSR digest line) and in the browser (reveal each event at real-time+24h; **freshness guard**:
  replay only when the file's `window` is yesterday-SGT, else digest-only — never present stale
  data as fresh). **Invariants, do not weaken:** the LLM phrases, it does not redact; the
  validator is the gate; nothing is ever shown sooner than 24h. Secrets (user-created):
  `FEED_GITHUB_PAT`, `ANTHROPIC_API_KEY`, `SPACES_KEY_ID`, `SPACES_SECRET` — each missing one
  no-ops its step so the workflow stays green until wired up. Publishing anonymized aggregate
  client activity is gated on a contracts check (rarebit-ops) before flipping to `live`.
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
- **Field notes** (`/notes`) are an Astro content collection (`src/content/notes/*.md`,
  schema in `src/content.config.ts`) with RSS at `/rss.xml`. Posts are agent-drafted,
  human-reviewed; only verifiable claims (public PRs, real data) — never invent metrics.
  `/privacy` documents the no-trackers stance and inquiry-data handling — keep it true (adding
  any analytics/tracker requires updating it). `public/llms.txt` is the AI-readable site
  summary; keep it in step with the page list.
- **Motion is CSS-only** and gated behind `prefers-reduced-motion` (orb floats, caret blink in
  `global.css`).
- Template raster/SVG assets under `public/images/` come from the Brainwave UI8 kit (licensed via
  the v1 purchase); brand assets under `public/images/rarebit/`.

This is a separate git repo in the `rarebit-one` org — `cd` here before git ops. Worktree-only
workflow and signed commits per the workspace CLAUDE.md.
