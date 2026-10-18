---
title: "Updates in Heyarr and Void-Which-Binds Projects"
description: "This week covers fixes, features, and releases in the heyarr and void-which-binds projects."
pubDate: 2026-10-19T06:02:08+08:00
---

## Heyarr-KMP Changes

Several updates were made in the `heyarr-kmp` project this week. Updates include an [Android screen state fix](https://github.com/rarebit-one/heyarr-kmp/pull/179), the renewal of render capabilities before they lapse ([PR 178](https://github.com/rarebit-one/heyarr-kmp/pull/178)), and [streaming the audio queue on locked phones](https://github.com/rarebit-one/heyarr-kmp/pull/177). To accommodate these updates, the project's mobile app saw successive releases, reaching [heyarr mobile v0.12.2](https://github.com/rarebit-one/heyarr-kmp/releases/tag/v0.12.2).

Additionally, the [vault codec was refactored](https://github.com/rarebit-one/heyarr-kmp/pull/176) to be moved into a private repository.

## Heyarr-Core Developments

On the `heyarr-core` front, new capabilities were added, such as a site being able to ask its sibling what to hold, both documented and implemented, as seen in [ADR-0114](https://github.com/rarebit-one/heyarr-core/pull/778) and [PR 775](https://github.com/rarebit-one/heyarr-core/pull/775). Another addition involves minting render capabilities for a queue before a screen locks ([PR 776](https://github.com/rarebit-one/heyarr-core/pull/776)).

The project saw multiple releases from [v0.5.10 to v0.5.17](https://github.com/rarebit-one/heyarr-core/releases/tag/v0.5.17), iterating on these features and including their fixes.

## Void-Which-Binds-KMP Updates

The `void-which-binds-kmp` project added new features, with [PR 129](https://github.com/rarebit-one/void-which-binds-kmp/pull/129) enabling the lazy unlocking of sealed keys on the JVM. Version updates included the release of [Cruciform 1.0.1](https://github.com/rarebit-one/void-which-binds-kmp/releases/tag/app-v1.0.1).

## Private System Performance

Across private systems, 807 runs occurred with 85% achieving green status. Categories included job, CI, and deploy, among others.

Review the asset increments and feature additions in a recent [field note](https://rarebit.one/field-notes/heyarr-repositories-gain-new-features-and-fixes).
