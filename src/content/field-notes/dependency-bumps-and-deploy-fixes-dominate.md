---
title: "Dependency Bumps and Deploy Fixes Dominate"
description: "This week saw multiple dependency updates and adjustments to deployment processes across repositories."
pubDate: 2026-08-17T06:02:31+08:00
---

## Public Repository Updates

This week, attention was directed toward addressing a security vulnerability in the `json` library. Both the `standard_singpass` and `standard_id` repositories updated their dependencies to version 2.21.2 to mitigate CVE-2026-71847 ([standard_singpass PR 43](https://github.com/rarebit-one/standard_singpass/pull/43), [standard_id PR 319](https://github.com/rarebit-one/standard_id/pull/319)).

Several repositories saw updates to action groups, indicating ongoing maintenance coordination. The repositories involved included `standard_id-google`, `storybook-inertia`, `standard_health`, `ktor-armour`, and `standard_singpass` ([standard_id-google PR 85](https://github.com/rarebit-one/standard_id-google/pull/85), [storybook-inertia PR 7](https://github.com/rarebit-one/storybook-inertia/pull/7), [standard_health PR 58](https://github.com/rarebit-one/standard_health/pull/58), [ktor-armour PR 47](https://github.com/rarebit-one/ktor-armour/pull/47), [standard_singpass PR 42](https://github.com/rarebit-one/standard_singpass/pull/42)).

In addition, `ktor-armour` bumped its `gradle-wrapper` from version 9.6.1 to 9.7.0 ([PR 46](https://github.com/rarebit-one/ktor-armour/pull/46)).

## Deploy Process Adjustments

The deployment processes across multiple repositories were refined with several PRs focusing on the `.github` repository. These adjustments included making tags write-once, resolving deployment IDs when missing, and other reusable CI updates ([.github PR 102](https://github.com/rarebit-one/.github/pull/102), [.github PR 100](https://github.com/rarebit-one/.github/pull/100), [.github PR 99](https://github.com/rarebit-one/.github/pull/99), [.github PR 98](https://github.com/rarebit-one/.github/pull/98)).

## Private Activity

Across private systems, there were 475 runs across 24 systems, with a success rate of 84%. Review cycles recorded 47 successes and 38 failures.

Past reflections on similar ongoing maintenance efforts can be found in [Rate Limiting and CI Cleanup Across Repositories](/field-notes/rate-limiting-and-ci-cleanup-across-repositories).
