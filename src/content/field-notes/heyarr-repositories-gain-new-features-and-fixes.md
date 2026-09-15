---
title: "Heyarr Repositories Gain New Features and Fixes"
description: "The heyarr suite sees updates in codec handling, playback, and series management."
pubDate: 2026-09-14T06:02:18+08:00
---

## Heyarr Desktop Enhancements

The heyarr-desktop repository introduced several playback improvements. Notably, the buffered scrubber now includes a warm-up state and changes for HDR playback, as well as casting fixes ([PR 14](https://github.com/rarebit-one/heyarr-desktop/pull/14)). The repository also received a 'Cast anyway' override for a renderer that under-declares codecs ([PR 15](https://github.com/rarebit-one/heyarr-desktop/pull/15)). A fix was applied to ensure the scrubber pins to the source runtime for transcode streams ([PR 13](https://github.com/rarebit-one/heyarr-desktop/pull/13)).

## Heyarr Core Updates

The heyarr-core repository also introduced a 'Cast anyway' feature for under-declaring renderers ([PR 533](https://github.com/rarebit-one/heyarr-core/pull/533)). Furthermore, it now exposes the source duration in the scrubber plan ([PR 528](https://github.com/rarebit-one/heyarr-core/pull/528)). Several bug fixes addressed reconciliation and acquisition processes ([PR 527](https://github.com/rarebit-one/heyarr-core/pull/527), [PR 526](https://github.com/rarebit-one/heyarr-core/pull/526)).

## Heyarr Mobile Developments

Heyarr-mobile added features to the player by displaying the buffered range on the scrubber ([PR 57](https://github.com/rarebit-one/heyarr-mobile/pull/57)). A shift towards harmonization between mobile and desktop platforms was documented ([PR 58](https://github.com/rarebit-one/heyarr-mobile/pull/58)). The series want is updated to be a follow, streamlining the process of managing series ([PR 59](https://github.com/rarebit-one/heyarr-mobile/pull/59)).

## Harness-Kernel Dependency Updates

In the harness-kernel repository, dependencies in both the actions-all and minor-patch groups were bumped, maintaining currency ([PR 51](https://github.com/rarebit-one/harness-kernel/pull/51), [PR 49](https://github.com/rarebit-one/harness-kernel/pull/49)).

## Private Work

Across private systems, 489 runs maintained mostly successful outcomes with an 86% green completion rate across 33 systems.
