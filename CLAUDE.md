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
  and `src/data/openSource.ts` (the /open-source catalog — descriptions are verbatim from v2's
  source-of-truth copy; keep them in sync with the gem READMEs when versions bump).
  Stats are playful fakes ("Managers: 0") — keep them obviously tongue-in-cheek, not claims.
- **Legal footer** (name, UEN, registered address) mirrors `rarebit-ops` `entity/profile.yml` —
  that file is the source of truth; update here when ACRA details change.
- **Contact is MCP-first.** All CTAs route to `/connect`, which documents the MCP endpoint
  (`https://rarebit.one/mcp`); email is the fallback. The endpoint is a DO Functions component in
  the same app (`functions/packages/mcp/server/index.mjs` — zero-dependency Streamable HTTP
  JSON-RPC, canned content + `submit_inquiry`, which opens a labeled `inquiry` issue in
  `rarebit-one/rarebit-ops`). Smoke-test it locally by importing `main` and posting JSON-RPC
  envelopes; `tools/call submit_inquiry` needs `GITHUB_TOKEN` (fine-grained PAT, Issues
  read/write on rarebit-ops only) + `GITHUB_REPO` env vars.
- **Shared SVG gradient defs** (`#btn-*`, `#brackets-*`) live once in `Layout.astro`; Button and
  Tagline reference them by id. The Benefits clip-path (`#benefits`) lives in `Benefits.astro`.
- **Motion is CSS-only** and gated behind `prefers-reduced-motion` (orb floats, caret blink in
  `global.css`).
- Template raster/SVG assets under `public/images/` come from the Brainwave UI8 kit (licensed via
  the v1 purchase); brand assets under `public/images/rarebit/`.

This is a separate git repo in the `rarebit-one` org — `cd` here before git ops. Worktree-only
workflow and signed commits per the workspace CLAUDE.md.
