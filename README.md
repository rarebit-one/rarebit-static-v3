# rarebit-static-v3

Marketing site for [rarebit.one](https://rarebit.one) — the Brainwave theme from v1, on the
Astro stack from v2, with content centered on Rarebit's AI automation farm.

## Develop

```bash
nvm use          # Node 22
npm install
npm run dev      # http://localhost:4321
```

## Build

```bash
npm run check    # type/diagnostic pass
npm run build    # static output → dist/
npm run preview  # serve the build locally
```

## Layout

| Path | Purpose |
|------|---------|
| `src/styles/global.css` | Brainwave design tokens (Tailwind 4 `@theme`) + component classes |
| `src/data/site.ts` | Page content: nav, stats, benefits, roadmap, legal entity, MCP endpoint |
| `src/data/openSource.ts` | The /open-source catalog |
| `src/components/` | Ported Brainwave primitives (Section, Button, Heading, …) |
| `src/components/sections/` | Home page sections (Hero, Benefits, Operations, …) |
| `src/pages/` | `index`, `open-source`, `connect` (MCP setup), `404` |
| `functions/` | DO Functions component — the MCP server at `/mcp` |
| `public/images/rarebit/` | Brand assets — logo + cinematic brand art |
| `docs/brand-guide.png` | Rarebit One brand guide (colors, type, taglines) |
