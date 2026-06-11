#!/usr/bin/env bash
#
# ============================================================================
#  REVIEW BEFORE RUNNING. This script MUTATES repo settings on
#  rarebit-one/rarebit-static-v3: it creates labels and applies BRANCH
#  PROTECTION to `main`. It is the ONLY place repo-settings changes for gated
#  auto-land (issue #29) are described. It is NOT run as part of any workflow
#  or PR — a human runs it once, deliberately, after AUTOLAND_PAT is set.
#
#  Prerequisites:
#    - `gh` authenticated as a user with admin on this repo.
#    - The secret AUTOLAND_PAT is already set on the repo (issue #29 task).
#    - The workflows from this PR are merged to main (so the required status
#      contexts below actually exist / will report).
#
#  Idempotent: re-running creates nothing twice (label creation tolerates
#  "already exists"; the protection PUT is a full replace of main's protection).
#
#  This does NOT flip the sweeper live. It stays in DRY-RUN until you run the
#  one-liner at the very bottom. Read it before you run it.
# ============================================================================

set -euo pipefail

REPO="rarebit-one/rarebit-static-v3"
BRANCH="main"

echo "== Gated auto-land setup for ${REPO} =="
echo "This will create labels and apply branch protection to '${BRANCH}'."
read -r -p "Proceed? [y/N] " ans
case "$ans" in
  y | Y) ;;
  *)
    echo "Aborted. No changes made."
    exit 0
    ;;
esac

# ---------------------------------------------------------------------------
# 1. Labels: the control surface for the sweeper.
#    auto-land   — opt a PR INTO auto-merge.
#    hold        — temporary pause (e.g. mid-discussion).
#    no-auto-land— permanent opt-out for a specific PR.
# ---------------------------------------------------------------------------
create_label() {
  local name="$1" color="$2" desc="$3"
  if gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" 2>/dev/null; then
    echo "  created label: $name"
  else
    # Already exists — keep it idempotent, just sync color/description.
    gh label edit "$name" --repo "$REPO" --color "$color" --description "$desc" >/dev/null
    echo "  label exists, synced: $name"
  fi
}

echo "-- Labels --"
create_label "auto-land"    "0e8a16" "Opt this PR into gated auto-merge once green + review-clear"
create_label "hold"         "fbca04" "Temporarily pause auto-land for this PR"
create_label "no-auto-land" "b60205" "Never auto-land this PR (permanent opt-out)"

# ---------------------------------------------------------------------------
# 2. Branch protection on main.
#    Required contexts MUST match the exact status names the workflows emit:
#      - "Type-check & build"  (ci.yml job name)
#      - "Link check"          (site-quality.yml job name; Lighthouse is advisory,
#                               intentionally NOT required)
#      - "claude-review/clear" (review-verdict.yml commit status context)
#    strict=true  → branch must be up to date with base before merge.
#    required_pull_request_reviews=null → no human approving review required
#       (the binding review is claude-review/clear; merge has no human step).
#    required_conversation_resolution=true → unresolved threads block.
#    enforce_admins=false → admins can still push/merge manually if needed.
#    restrictions=null → no push allow-list (the PAT user merges via the API).
# ---------------------------------------------------------------------------
echo "-- Branch protection on ${BRANCH} --"

read -r -d '' PROTECTION_JSON <<'JSON' || true
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Type-check & build",
      "Link check",
      "claude-review/clear"
    ]
  },
  "required_pull_request_reviews": null,
  "required_conversation_resolution": true,
  "enforce_admins": false,
  "restrictions": null
}
JSON

echo "$PROTECTION_JSON" | gh api \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  "/repos/${REPO}/branches/${BRANCH}/protection" \
  --input - >/dev/null

echo "  branch protection applied."

echo
echo "== Done. Sweeper is still in DRY-RUN. =="
echo
echo "To go LIVE (the sweeper will start actually merging eligible PRs), run:"
echo
echo "    gh variable set AUTOLAND_LIVE --repo ${REPO} --body true"
echo
echo "To return to dry-run later:"
echo
echo "    gh variable set AUTOLAND_LIVE --repo ${REPO} --body false"
