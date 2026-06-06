# CLAUDE.md — rarebit-static-v3

The v3 marketing site for **rarebit.one**. The Brainwave (UI8) theme that powered v1, rebuilt on
the v2 tech stack (Astro). Replaces `rarebit-static-v2` (bespoke cyberpunk-watercolor design,
abandoned) and `rarebit-static` (v1, the original Brainwave React-Router SPA).

## Stack

- **Astro** (`output: 'static'`) + **Tailwind 4** (CSS-first `@theme` in `src/styles/global.css`)
- **Zero JS frameworks** — the only client script is the mobile nav toggle in `Header.astro`;
  template animations (Splide carousel, react-just-parallax) were replaced with CSS grid and
  CSS keyframes
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

- **The theme is Brainwave, verbatim.** Palette (`color-1..6`, `n-1..8`, `stroke-1`), type scale
  (`.h1`–`.h6`, `.body-1/2`, `.tagline`, `.button`), and section chrome (crosses, side rails,
  conic-gradient borders) are ported 1:1 from the v1 Tailwind 3 config into `global.css`
  `@theme`/`@layer components`. **Don't re-tint the chrome toward the brand magenta/cyan** —
  brand color arrives via imagery only (`public/images/rarebit/`: logo + dashboard art).
- **Copy centers on the AI automation farm** — AI adoption work, workflow automation, agents with
  humans in the loop. **Never name clients.** Brand voice from `docs/brand-guide.png`: taglines
  like "Small Teams. Impossible Things." / "Human Creativity. Amplified."
- **Content lives in `src/data/site.ts`** (nav, stats, benefits, collaboration, roadmap, contact).
  Stats are playful fakes ("Managers: 0") — keep them obviously tongue-in-cheek, not claims.
- **Shared SVG gradient defs** (`#btn-*`, `#brackets-*`) live once in `Layout.astro`; Button and
  Tagline reference them by id. The Benefits clip-path (`#benefits`) lives in `Benefits.astro`.
- **Motion is CSS-only** and gated behind `prefers-reduced-motion` (orb floats, caret blink in
  `global.css`).
- Template raster/SVG assets under `public/images/` come from the Brainwave UI8 kit (licensed via
  the v1 purchase); brand assets under `public/images/rarebit/`.

This is a separate git repo in the `rarebit-one` org — `cd` here before git ops. Worktree-only
workflow and signed commits per the workspace CLAUDE.md.
