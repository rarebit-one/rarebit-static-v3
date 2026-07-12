---
title: "Rate Limiting and CI Cleanup Across Repositories"
description: "Recent updates focus on rate limits, CI timeout caps, and releases."
pubDate: 2026-07-13T06:15:02+08:00
---

## Rate Limiting Developments

This week's updates included important enhancements to rate limiting features on authentication surfaces. The [standard_id](https://github.com/rarebit-one/standard_id/pull/268) now enforces rate limiting on authentication and includes an OTP-resend cooldown. Similarly, the [standard_id-provider](https://github.com/rarebit-one/standard_id-provider/pull/55) has introduced rate limits on token introspection and revocation endpoints.

## Cap on Runaway-Hang Timeouts

A recurring theme across multiple repositories this cycle involved capping timeouts to handle runaway-hangs effectively, addressing issues across workflows. This preventive measure was implemented in repositories such as [rarebit-static-v3](https://github.com/rarebit-one/rarebit-static-v3/pull/218), [standard_singpass](https://github.com/rarebit-one/standard_singpass/pull/25), and others, ensuring streamlined CI operations.

## Releases and Progress

Two significant releases occurred this week in the [standard_id](https://github.com/rarebit-one/standard_id/releases/tag/v0.28.0) and [standard_id-provider](https://github.com/rarebit-one/standard_id-provider/releases/tag/v0.3.0) repositories. These updates highlight ongoing efforts to synchronize enhancements across projects.

For a look at CI improvements from previous weeks, revisit [Standard ID v0.27.0 Release and CI Enhancements](/field-notes/standard-id-v0-27-0-release-and-ci-enhancements).
