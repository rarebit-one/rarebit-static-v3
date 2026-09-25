# Brainwave theme and brand accents

Moved verbatim from the old `CLAUDE.md` ("Conventions"); the rules that must hold are summarised in [`AGENTS.md`](../../AGENTS.md).

- **The theme is Brainwave, with brand accents.** Palette (`color-1..6`, `n-1..8`, `stroke-1`),
  type scale (`.h1`–`.h6`, `.body-1/2`, `.tagline`, `.button`), and section chrome (crosses,
  side rails, conic-gradient borders) are ported 1:1 from the v1 Tailwind 3 config into
  `global.css` `@theme`/`@layer components`. Brand colors from `docs/brand-guide.png`
  (`brand-magenta` #FF0F8A, `brand-cyan` #00E8FF) are layered on deliberately: **magenta** for
  interactive states (link/button hovers, list markers via `images/rarebit/check.svg`),
  **cyan** for code/identifiers (MCP endpoint, tool names) and card-border hovers. Structural
  chrome stays template-neutral; brand imagery lives in `public/images/rarebit/`.
