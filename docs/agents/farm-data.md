# Build-time farm data

Moved verbatim from the old `CLAUDE.md` ("Conventions"); the rules that must hold are summarised in [`AGENTS.md`](../../AGENTS.md).

- **Build-time farm data** (`src/lib/farm.ts`): hero stats, Operations receipts, gem
  versions/downloads, and the footer stamp are fetched from public GitHub/RubyGems APIs at
  build, memoized per process, with static fallbacks — a flaky API must never break the build,
  and the stats strip falls back to the all-playful set rather than mixing real labels with
  fake numbers ("Managers: 0" stays obviously tongue-in-cheek). `weekly-rebuild.yml` forces a
  DO rebuild Mondays 06:00 SGT to keep the numbers fresh; `site-quality.yml` runs link checks
  (blocking) and Lighthouse (advisory) on PRs. The link check excludes our own `rarebit.one`
  domain from the network probe — a PR's new pages 404 on prod until they deploy, and the
  POST-only `/mcp` returns 405 to a GET; root-relative links are still validated against `dist`.
