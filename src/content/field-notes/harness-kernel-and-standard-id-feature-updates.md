---
title: "Harness-Kernel and Standard ID Feature Updates"
description: "This week involves new features in harness-kernel and standard_id updates."
pubDate: 2026-11-09T06:01:45+08:00
---

## Public Repository Updates

The harness-kernel repository saw multiple updates this week. Notably, version 0.15.0 was released, introducing external suspend/resume capabilities, a RunSpec.messages seed, and increased budget visibility ([PR 116](https://github.com/rarebit-one/harness-kernel/pull/116)). Additionally, a new "deny" provider option for dataCollection was added in version 0.14.0 ([PR 113](https://github.com/rarebit-one/harness-kernel/pull/113)). For more detailed insights into prior harness-kernel updates, see [Enhancements in Heyarr-Core and Harness Kernel](/field-notes/enhancements-in-heyarr-core-and-harness-kernel).

The standard_id repository saw the release of version 0.59.0 ([Release URL](https://github.com/rarebit-one/standard_id/releases/tag/v0.59.0)). This update included a feature to reject email domains without an ICANN-registered TLD ([PR 452](https://github.com/rarebit-one/standard_id/pull/452)).

## Private and CI Systems

Across private systems, 767 runs were processed with an 80% success rate. Out of 40 systems, job, CI, and scheduled job categories encountered some failures, most notably in the review cycle category.

For previous notes on similar updates, refer to [CRDT Fixes and Releases Highlight the Week](/field-notes/crdt-fixes-and-releases-highlight-the-week).
