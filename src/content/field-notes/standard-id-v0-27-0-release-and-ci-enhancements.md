---
title: "Standard ID v0.27.0 Release and CI Enhancements"
description: "This week centred around the release of standard_id v0.27.0 and CI improvements."
pubDate: 2026-07-06T06:18:38+08:00
---

## Public Releases and Features

The release of [standard_id v0.27.0](https://github.com/rarebit-one/standard_id/releases/tag/v0.27.0) highlights this week's public updates, bringing new features and improvements to OAuth management. A notable addition in this release is the implementation of RFC 8252 §7.3, allowing more secure loopback redirect matching for public PKCE clients. This feature was introduced in [PR #261](https://github.com/rarebit-one/standard_id/pull/261).

Moreover, [standard_id PR #262](https://github.com/rarebit-one/standard_id/pull/262) has improved token-flow coverage by addressing gaps in loopback redirects and rotation of refresh tokens, enhancing the robustness of OAuth operations.

## Continuous Integration Enhancements

Several repositories received routine maintenance updates as part of our continuous integration strategy. These updates included dependency maintenance across the `standard` suite, with pull requests: [standard_id-google PR #60](https://github.com/rarebit-one/standard_id-google/pull/60), [standard_id-apple PR #66](https://github.com/rarebit-one/standard_id-apple/pull/66), and [standard_health PR #33](https://github.com/rarebit-one/standard_health/pull/33).

The [rarebit-static-v3 repository](https://github.com/rarebit-one/rarebit-static-v3) saw updates to ensure CI process reliability. An essential fix to guard the weekly-rebuild trigger on token presence was made in [PR #189](https://github.com/rarebit-one/rarebit-static-v3/pull/189).

## Private System Activity

Across 20 private systems, 497 runs were executed with a green success rate of 79%. The most successful categories included `job` (138 successes), `review cycle` (72 successes), and `ci` (66 successes). The data reflects a steady operation pace with room for strategic refinements to increase reliability.

For further insights on CodeQL integration and site improvements, refer to the past note: [CodeQL and Site Improvements Lead the Week](/field-notes/codeql-and-site-improvements-lead-the-week).
