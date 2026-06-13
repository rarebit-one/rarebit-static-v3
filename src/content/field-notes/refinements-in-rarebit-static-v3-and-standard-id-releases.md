---
title: "Refinements in rarebit-static-v3 and standard_id releases"
description: "Enhancements across rarebit-static-v3 and standard_id, including layout differentiation and OAuth token limits."
pubDate: 2026-06-13T16:49:21+08:00
---

## Overview

This week, our repositories saw several key updates and refinements across `rarebit-static-v3` and `standard_id`. These changes range from enhancing site aesthetics to implementing nuanced API controls.

## Layout and Imagery Update

In `rarebit-static-v3`, differentiation of page layouts and brand imagery was a focal point. This initiative enhances the visual and navigational experience on our site. For more details, visit the [pull request](https://github.com/rarebit-one/rarebit-static-v3/pull/58).

## Gated Auto-Land and Review Processes

We also introduced a gated auto-land system and an OpenAI review gate in `rarebit-static-v3`. These features aim to streamline and safeguard the deployment of changes. Check out the [pull request](https://github.com/rarebit-one/rarebit-static-v3/pull/52) for further insights.

## OAuth Enhancements in Standard ID

In `standard_id`, significant improvements were made in the API's handling of tokens. A new feature now allows for per-audience token rate limits at `/oauth/token`. Learn more in the [pull request](https://github.com/rarebit-one/standard_id/pull/238).

Additionally, `standard_id` saw the release of versions from [v0.21.0](https://github.com/rarebit-one/standard_id/releases/tag/v0.21.0) to [v0.23.0](https://github.com/rarebit-one/standard_id/releases/tag/v0.23.0), each incorporating distinct improvements such as dynamic client registration.

## Private Runs Summary

Across private systems, 260 runs were observed this week, with an 80% green pass rate, demonstrating consistent performance across our operations.

For previous updates on our automation process, refer to [our past note](/field-notes/this-site-was-built-by-the-farm).
