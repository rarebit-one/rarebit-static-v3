# Gated auto-land

Moved verbatim from the old `CLAUDE.md` ("Gated auto-land"); the workspace merge rule is cited as **Rule 5** (merge on green), since the workspace `AGENTS.md` no longer numbers it #7. The invariants are summarised in [`AGENTS.md`](../../AGENTS.md).

## Gated auto-land (in-repo automation of Rule 5)

PRs in this repo auto-merge once reviewed + green, with no manual merge step at all. This
**aligns with** workspace `AGENTS.md` Rule 5 (merge autonomously once required CI is green,
mergeable, and any required review is satisfied) — it just *automates* that merge here via repo
settings + workflows instead of an agent invoking `/ship`/`/land`. The wider workspace reaches the
same outcome (autonomous merge on green); this repo wires it into the repo's settings + CI so it
happens with zero human or agent intervention. Tracked in issue #29.

- **`.github/workflows/review-verdict.yml`** (+ `.github/scripts/review-verdict.mjs`) — the
  binding, repo-local review gate. On every PR push it sends the diff to the OpenAI API (via the
  shared `scripts/lib/llm.mjs` helper; model = `OPENAI_MODEL` repo var, default `gpt-4o`) with a
  strict rubric and records the verdict as commit status **`review/clear`**. It blocks ONLY on
  correctness/security/build-type issues or repo invariant violations (leaked client/private
  identifiers, off-brand voice, fabricated metrics) — never style nitpicks. **Fail closed:** any
  error (missing `OPENAI_API_KEY`, API failure, unparseable response) sets `failure`, never
  `success`. The separate org-level `claude-code-review.yml` stays as informal commentary — it is
  NOT the gate.
- **`.github/workflows/auto-land.yml`** (+ `.github/scripts/auto-land.mjs`) — the event-driven
  sweeper. A PR is eligible iff it has label `auto-land`, is not a draft, lacks `hold`/
  `no-auto-land`, has no trusted `STOP` comment after the latest commit, is `MERGEABLE`, and has
  ALL required contexts green: **`Type-check & build`**, **`Link check`**, **`review/clear`**
  (advisory **`Lighthouse (advisory)`** is intentionally NOT required). Eligibility keys on the
  **label**, not author identity. Merges (squash + delete-branch) use a **non-ambient** token so
  downstream CI/deploy `workflow_run` jobs fire, resolved by the precedence **`rarebit-one` App
  installation token → `AUTOLAND_PAT` → `GITHUB_TOKEN`**. The App rung (org var
  `RELEASE_BOT_CLIENT_ID` + org secret `RELEASE_BOT_PRIVATE_KEY`) never expires and is the normal
  path; the PAT is a retained fallback, no longer required. The `GITHUB_TOKEN` rung fires **no
  `push` event**, so it is a last-resort degradation that announces itself with a `::warning::`
  and a job-summary block naming the deploys that will not run — never a silent success.
  **DRY-RUN unless repo var `AUTOLAND_LIVE == "true"`** — until flipped, it logs `would land #N`
  and merges nothing.
- **`scripts/autoland/enable.sh`** — the ONE place repo-settings changes are described (labels +
  `main` branch protection requiring the three contexts above, `required_pull_request_reviews:
  null`, `required_conversation_resolution: true`). Run once by a human after `AUTOLAND_PAT` is
  set; it is never executed by any workflow. The go-live one-liner
  (`gh variable set AUTOLAND_LIVE --body true`) lives at its bottom.
- **`field-notes.yml`** rides this lane: instead of pushing the weekly note to main, it opens an
  `auto-land` PR (branch `field-notes/<slug>`, pushed + created via `AUTOLAND_PAT`) so CI +
  `review/clear` run, then the sweeper merges it.

**Future agents: do NOT "fix" `auto-land.yml` or `field-notes.yml`'s PR-path (or this section) as
a Rule 5 governance violation.** It is the intended automation of Rule 5's autonomous-merge
policy for this repo, not a contradiction of it. If you think it's wrong, raise it with the owner
via issue #29 — don't revert it.
