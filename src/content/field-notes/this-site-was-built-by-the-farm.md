---
title: "This site was built by the farm (humans merged)"
description: "Six pull requests, agent-written code, human-approved merges — the build log of rarebit.one, which is also a demo of the service."
pubDate: 2026-06-08T09:00:00+08:00
---

The site you're reading was built the way we build everything: agents do the
work, humans approve the merge. Every pull request is public, so this isn't a
claim — it's a [build log](https://github.com/rarebit-one/rarebit-static-v3/pulls?q=is%3Apr+is%3Amerged).

## The loop

Each round ran the same way:

1. A human described what they wanted — sometimes a list of bugs, sometimes
   one line ("the connect page is not mobile friendly").
2. An agent did the work in an isolated worktree: read the design reference,
   made the changes, ran the type checks and builds, opened the PR.
3. CI ran, and a second agent reviewed the diff — the review workflow on this
   repo is itself something the first agent set up mid-project.
4. A human read the review, sometimes pushed back, and clicked merge.

The review loop earned its keep immediately: it caught a coordinate-space bug
in the carousel's scroll math and an accessibility gap in the pagination dots,
both fixed before merge.

## What actually broke

Porting a Tailwind 3 template to Tailwind 4 has two traps worth stealing:

- **The core `container` utility outranks `@layer components`.** Our
  custom container widths were silently overridden by breakpoint defaults —
  the fix is to redefine `container` via `@utility`, which replaces the
  built-in.
- **`.inline-flex` sorts after `.hidden` now.** The template's
  `hidden lg:flex` button pattern never hides in v4 — use `max-lg:hidden`
  instead.

Both are documented in the repo so they can't bite twice.

## The point

The numbers on the [home page](/) are fetched from public GitHub and RubyGems
when the site builds, the [MCP endpoint](/connect) answers from the same repo
that serves this page, and the inquiry form writes to the same inbox the
agents triage. Small team. The site is the demo.
