---
title: "Enhancements in Heyarr-Core and Harness Kernel"
description: "This week covers enhancements made to heyarr-core and updates in harness-kernel."
pubDate: 2026-08-24T06:03:09+08:00
---

## Heyarr-Core Updates

Several updates were made to the `heyarr-core` repository this week. A handler for `chunk_blob` was introduced, completing a task listed since Milestone 1 ([PR 209](https://github.com/rarebit-one/heyarr-core/pull/209)). New state handling for chunk manifests was established, rendering certain states obsolete ([PR 206](https://github.com/rarebit-one/heyarr-core/pull/206)). Additionally, FastCDC content-defined chunking has been implemented, providing pure and deterministic results ([PR 198](https://github.com/rarebit-one/heyarr-core/pull/198)).

Integrations in `heyarr-core` also included enhancements to peer liveness observation, now employing probing over mTLS ([PR 200](https://github.com/rarebit-one/heyarr-core/pull/200)). Furthermore, documentation clarified the decentralised nature of peers, which act as repositories without a central authority ([PR 201](https://github.com/rarebit-one/heyarr-core/pull/201)). Acceptance tests in `heyarr-core` now have the capability to declare the requirements they need ([PR 199](https://github.com/rarebit-one/heyarr-core/pull/199)).

## Harness-Kernel Updates

In the `harness-kernel` repository, a minor-patch dependency bump was executed with four updates included ([PR 43](https://github.com/rarebit-one/harness-kernel/pull/43)). This follows a recent security update that addressed two high CodeQL findings in sandbox primitives ([PR 42](https://github.com/rarebit-one/harness-kernel/pull/42)). Additionally, a new release, `v0.5.2`, is now available ([v0.5.2](https://github.com/rarebit-one/harness-kernel/releases/tag/v0.5.2)).

## Private Systems Overview

Across private systems, a total of 706 runs were executed with 84% running green. Among the 23 systems, 257 jobs completed successfully. In CI, 150 runs were successful, while review cycles showed mixed results with 73 unsuccessful iterations.

For more on recent activities, see the [previous note](/field-notes/dependency-bumps-and-deploy-fixes-dominate).
