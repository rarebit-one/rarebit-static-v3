// Review-verdict gate: send the PR diff to the OpenAI API (via the shared
// scripts/lib/llm.mjs helper) with a strict rubric, parse a structured JSON
// verdict, and record it as the commit status `review/clear` on the PR head SHA.
//
// FAIL CLOSED. Every failure path below ends in setStatus("failure", ...). The
// only way to reach `success` is an explicit, well-formed {"verdict":"clear"}.
//
// Env (provided by review-verdict.yml):
//   GH_TOKEN, OPENAI_API_KEY, OPENAI_MODEL, OWNER, REPO, SHA, PR
// Reads the diff from ./pr.diff (written by the workflow step).

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { callLLM } from "../../scripts/lib/llm.mjs";

const { GH_TOKEN, OPENAI_API_KEY, OWNER, REPO, SHA, PR } = process.env;
const CONTEXT = "review/clear";

// --- helpers ---------------------------------------------------------------

function setStatus(state, description) {
  // Status descriptions are capped at 140 chars by the API.
  const desc = String(description).slice(0, 140);
  try {
    execFileSync(
      "gh",
      [
        "api",
        "-X",
        "POST",
        `/repos/${OWNER}/${REPO}/statuses/${SHA}`,
        "-f",
        `state=${state}`,
        "-f",
        `context=${CONTEXT}`,
        "-f",
        `description=${desc}`,
      ],
      { stdio: ["ignore", "ignore", "inherit"], env: process.env },
    );
  } catch (err) {
    console.error(`Failed to set commit status: ${err.message}`);
    // If we can't even set the status, exit non-zero so the job is red. A red
    // job with no success status still blocks the merge (fail closed).
    process.exit(1);
  }
}

function comment(body) {
  try {
    execFileSync("gh", ["pr", "comment", PR, "--repo", `${OWNER}/${REPO}`, "--body", body], {
      stdio: ["ignore", "ignore", "inherit"],
      env: process.env,
    });
  } catch (err) {
    // A failed comment must not flip the verdict — log and continue.
    console.error(`Failed to post PR comment: ${err.message}`);
  }
}

function blockAndExit(reason, findings) {
  const summary = findings && findings.length ? findings.join("; ") : reason;
  setStatus("failure", `Blocking: ${summary}`);
  const lines = (findings && findings.length ? findings : [reason]).map((f) => `- ${f}`).join("\n");
  comment(
    `### Review verdict: BLOCKING\n\n${lines}\n\n` +
      `_Address these and push — the gate re-evaluates on every push. ` +
      `This is an automated correctness/security/invariant gate, not a style review._`,
  );
  process.exit(0); // job itself succeeded; the *status* is failure
}

// --- preconditions (fail closed) -------------------------------------------

if (!OPENAI_API_KEY) {
  setStatus("failure", "OPENAI_API_KEY not set — gate cannot run; nothing auto-lands until wired.");
  console.error("OPENAI_API_KEY absent. Fail closed.");
  process.exit(0);
}
if (!GH_TOKEN || !OWNER || !REPO || !SHA || !PR) {
  console.error("Missing required env (GH_TOKEN/OWNER/REPO/SHA/PR). Fail closed.");
  // Best-effort status; if SHA is missing this will itself fail and exit 1.
  setStatus("failure", "Gate misconfigured — missing required environment.");
  process.exit(0);
}

let diff = "";
try {
  diff = readFileSync("pr.diff", "utf8");
} catch (err) {
  blockAndExit(`Could not read PR diff: ${err.message}`);
}

if (!diff.trim()) {
  // Empty diff (e.g. branch already merged into base, or whitespace-only). With
  // nothing to review there is no correctness/security risk, so allow it.
  setStatus("success", "No reviewable diff — nothing to block.");
  process.exit(0);
}

// Cap the diff so a huge PR can't blow the token budget. Truncation is noted to
// the model so it errs toward blocking if it can't see the whole change.
const MAX_DIFF = 180_000;
let truncated = false;
if (diff.length > MAX_DIFF) {
  diff = diff.slice(0, MAX_DIFF);
  truncated = true;
}

// --- rubric ----------------------------------------------------------------

const RUBRIC = `You are a strict but fair pre-merge gate for the rarebit.one static marketing
site (Astro + Tailwind 4, zero JS frameworks). You return a binding verdict that
decides whether a pull request may auto-merge with NO human in the loop.

Return ONLY a JSON object, no prose, no markdown fences:
{ "verdict": "clear" | "blocking", "findings": ["..."] }

Block (verdict "blocking") ONLY when the diff contains at least one of:
- A correctness bug that would break the page or produce wrong output.
- A security issue: a secret/token VALUE hardcoded in the diff, a secret echoed to logs or written to an artifact, command/script injection, or unsafe handling of untrusted input. (Reading repository secrets or variables into workflow env via the Actions secrets/vars context, declaring \`permissions:\`, or passing a token to a step, is the STANDARD, correct GitHub Actions pattern — NOT a vulnerability; never flag it.)
- A change that would break the build or type-check (astro check), or invalid YAML/JS that fails CI.
- A violation of the repo's content invariants:
  * a leaked CLIENT or PRIVATE identifier (client name, private repo name, login, internal URL, real customer data),
  * the name of ANOTHER organization or its projects — including a split-out sibling org such as "luminalityai" / "luminality-web" / "luminality-app" / "luminality-ui",
  * off-brand voice that contradicts VOICE.md / the brand guide,
  * a FABRICATED metric (a number presented as real that isn't grounded in public data).
  CARVE-OUT (narrow): rarebit-one's OWN public repositories are NOT a leak. In field-notes content (src/content/field-notes/*.md), references to rarebit-one's own public repos — by bare name (e.g. "rarebit-static-v3", "standard_id", "standard_health") and via github.com/rarebit-one/<repo> links — are expected, on-brand, and the entire point of a public field note. Do NOT flag these. This carve-out permits ONLY rarebit-one's own public repo identifiers, and ONLY as the kind of public-PR/release references field notes legitimately make. It does NOT cover any other org (still block "luminality*"/"luminalityai" and any client), any private/internal-only repo name, any private blocklist identifier, or any email/@handle/fabricated number — those remain blocking everywhere, field notes included.

Do NOT block on:
- Style nitpicks, naming preferences, formatting, comment wording.
- Subjective "could be cleaner" suggestions.
- Standard GitHub Actions secret/token handling (secrets or vars in env, GITHUB_TOKEN or a PAT's permissions and usage) — expected, not a finding.
- Anything the existing automated checks (lint/types/build/link-check) already cover and that looks fine here.

This gate must be passable on a clean first try for a well-made PR. When in doubt
and you see no concrete instance of the blocking categories above, return "clear".
If the diff is truncated and you cannot confirm safety of the unseen portion,
prefer "blocking" with a finding that says so.

findings: for "blocking", list each concrete problem in one short sentence. For
"clear", findings may be an empty array.`;

const userContent =
  (truncated ? "NOTE: the diff below was TRUNCATED for length.\n\n" : "") +
  "PR diff to review:\n\n```diff\n" +
  diff +
  "\n```";

// --- evaluate --------------------------------------------------------------

function extractJson(text) {
  // The model is asked for bare JSON, but tolerate a stray fence or surrounding
  // prose by grabbing the first balanced {...} block.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("no JSON object in response");
  return JSON.parse(text.slice(start, end + 1));
}

try {
  const text = (await callLLM({ system: RUBRIC, prompt: userContent, maxTokens: 1024, json: true })).trim();
  if (!text) throw new Error("empty model response");

  const parsed = extractJson(text);
  const verdict = parsed.verdict;
  const findings = Array.isArray(parsed.findings) ? parsed.findings.map(String) : [];

  if (verdict === "clear") {
    setStatus("success", "Review clear — no blocking correctness/security/invariant issues.");
    console.log("Verdict: clear");
    process.exit(0);
  }
  if (verdict === "blocking") {
    console.log(`Verdict: blocking — ${findings.join("; ")}`);
    blockAndExit("blocking", findings);
  }
  // Any other value is unparseable → fail closed.
  throw new Error(`unexpected verdict value: ${JSON.stringify(verdict)}`);
} catch (err) {
  console.error(`Gate error: ${err.message}`);
  setStatus("failure", `Gate error (fail closed): ${err.message}`);
  process.exit(0);
}
