// Field-notes seed-usage resolution (deterministic) — #54.
//
// The notebook scout files idea-seeds as open `field-note-seed` issues; the
// field-notes drafter may draw on them, and the workflow closes the ones a
// published note used so the open-seed queue doesn't grow unbounded (the dedup
// read caps at 100). Closing relied SOLELY on the model self-reporting which
// seeds it used via the draft's `usedSeedIssues` — but gpt-4o routinely returns
// an empty array even when it clearly drew on a seed, so seeds never closed.
//
// Resolve usage DETERMINISTICALLY instead: a seed was demonstrably used iff one
// of its grounding URLs appears as a link in the published note body. The
// model's self-report is unioned in, but filtered to issue numbers it was
// actually given, so a hallucinated or stray number can never close an
// unrelated issue. Same lesson as the cross-org scrub: don't trust negative or
// bookkeeping instructions to the model — enforce in code.

const URL_RE = /https?:\/\/[^\s)\]<>"']+/gi;

// Strip trailing punctuation and slashes so a seed URL and the note's rendered
// link normalize to the same token (e.g. ".../pull/73", ".../pull/73/", and a
// markdown "[t](.../pull/73)." all compare equal).
const normalizeUrl = (u) => String(u).trim().replace(/[.,;:/]+$/, "");

/**
 * @param {object}   args
 * @param {Array}    args.seeds        the gathered notebook seeds ({ issue, grounding } each)
 * @param {string}   args.body         the published note markdown
 * @param {number[]} [args.modelClaimed] the draft's self-reported usedSeedIssues
 * @returns {number[]} sorted, de-duped issue numbers to close
 */
export function resolveUsedSeeds({ seeds, body, modelClaimed } = {}) {
  const inputSeeds = Array.isArray(seeds) ? seeds : [];
  const inputNumbers = new Set(
    inputSeeds
      .map((s) => Number(s?.issue))
      .filter((n) => Number.isInteger(n) && n > 0)
  );

  // Exact-match against the set of URLs actually present in the note (not a
  // substring scan) so ".../pull/73" can't falsely match ".../pull/733".
  const bodyUrls = new Set(
    (String(body ?? "").match(URL_RE) ?? []).map(normalizeUrl)
  );

  const used = new Set();
  for (const seed of inputSeeds) {
    const n = Number(seed?.issue);
    if (!Number.isInteger(n) || n <= 0) continue;
    const grounding = Array.isArray(seed?.grounding) ? seed.grounding : [];
    if (grounding.some((u) => typeof u === "string" && bodyUrls.has(normalizeUrl(u)))) {
      used.add(n);
    }
  }

  // Secondary signal: keep the model's self-report, but only for issue numbers
  // it was actually handed — it cannot close anything it wasn't given.
  for (const raw of Array.isArray(modelClaimed) ? modelClaimed : []) {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0 && inputNumbers.has(n)) used.add(n);
  }

  return [...used].sort((a, b) => a - b);
}
