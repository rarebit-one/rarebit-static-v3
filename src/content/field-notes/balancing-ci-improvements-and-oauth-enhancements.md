---
title: "Balancing CI Improvements and OAuth Enhancements"
description: "This week highlights CI changes and OAuth enhancements in public repositories."
pubDate: 2026-08-10T06:05:57+08:00
---

## Public Repository Updates

Several repositories added CodeQL analysis, including [`storybook-inertia`](https://github.com/rarebit-one/storybook-inertia/pull/6) and [`rarebit-static-v3`](https://github.com/rarebit-one/rarebit-static-v3/pull/359). CodeQL is available at no cost on public repositories.

`rarebit-static-v3` made the Auto-land process event-driven ([PR 358](https://github.com/rarebit-one/rarebit-static-v3/pull/358)), so it now triggers on events rather than the scheduled cron job. The auto-merge workflow was switched from a PAT to an App token ([PR 356](https://github.com/rarebit-one/rarebit-static-v3/pull/356)).

`ktor-armour` ([PR 45](https://github.com/rarebit-one/ktor-armour/pull/45)) and `standard_id` ([PR 315](https://github.com/rarebit-one/standard_id/pull/315)) now cancel superseded workflow runs on pull requests.

## OAuth Enhancements

In `standard_id`, the OAuth module gained a path for a client to recover from a lost refresh response ([PR 316](https://github.com/rarebit-one/standard_id/pull/316)).

For more historical context, see the [previous field note](/field-notes/test-order-independence-and-oauth-enhancements/).

## Private Systems Overview

Across anonymized private systems, 569 runs executed, at an 84% green rate: 255 successful jobs, 68 successful and 59 unsuccessful review cycles, and 57 successful tests among others.
