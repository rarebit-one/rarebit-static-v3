// Credential preflight — makes a missing-credential no-op LOUD (#355).
//
// The content workflows (drift-actor, field-notes, voice-actor) deliberately
// degrade to a no-op when a secret is unset: exit 0, run stays green, nothing
// published. That half is right. The other half of the actuator-arming
// convention is that the no-op must be LOUD — otherwise "published nothing
// because a credential vanished" is indistinguishable from a quiet week.
//
// So, before any work, each workflow runs this with the credentials it needs:
//
//   node scripts/lib/credential-preflight.mjs \
//     "OPENAI_API_KEY|no draft is generated" \
//     "AUTOLAND_PAT|no PR is opened"
//
// For every spec whose env var is empty it emits a `::warning::` annotation and
// an explicit UNVERIFIED line in $GITHUB_STEP_SUMMARY. It ALWAYS exits 0: the
// point is visibility, not enforcement (a red optional content workflow is
// worse than a quiet one). Secret values are read from env only — never argv —
// and are never printed; only presence is checked.

import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Pure: specs ["NAME|consequence[|degraded]", …] + env → { missing, annotations, summary }.
//
// A spec is a NO-OP credential by default: without it nothing is published.
// Suffix `|degraded` for a credential whose absence does NOT stop publishing
// but weakens it (e.g. field-notes' FEED_GITHUB_PAT: gather falls back to
// GITHUB_TOKEN and a public-only note can still ship) — its wording says the
// run continued degraded, never that it published nothing.
export function preflight(specs, env, workflow = "workflow") {
  const missing = [];
  for (const spec of specs) {
    const [name, consequence = "the step that needs it is skipped", kind] = String(spec).split("|");
    if (!name) continue;
    if (!String(env[name] ?? "").trim()) {
      missing.push({ name, consequence, degraded: kind === "degraded" });
    }
  }
  // Workflow-command property values must escape ':' and ',' (%3A / %2C).
  const title = `${workflow}: credential missing`.replace(/%/g, "%25").replace(/:/g, "%3A").replace(/,/g, "%2C");
  const outcome = (m) =>
    m.degraded
      ? "The run continues DEGRADED; anything it publishes is UNVERIFIED."
      : "This run is a no-op and publishes nothing.";
  const annotations = missing.map(
    (m) => `::warning title=${title}::${m.name} is unset — ${m.consequence}. ${outcome(m)}`
  );
  const allDegraded = missing.length > 0 && missing.every((m) => m.degraded);
  const summary = missing.length
    ? [
        `### ⚠️ UNVERIFIED — ${workflow} ran ${allDegraded ? "degraded" : "as a no-op"}`,
        "",
        ...missing.map(
          (m) =>
            `- \`${m.name}\` unset — ${m.consequence}; ${m.degraded ? "continuing degraded" : "nothing published"}.`
        ),
        "",
        allDegraded
          ? "Output from this run is UNVERIFIED. Wire the secret(s) above to restore the full pipeline."
          : "A green run here is NOT evidence that anything was published. Wire the secret(s) above to arm it.",
        "",
      ].join("\n")
    : `✅ ${workflow}: all credentials present (${specs.map((s) => `\`${String(s).split("|")[0]}\``).join(", ")}).\n`;
  return { missing, annotations, summary };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const workflow = process.env.GITHUB_WORKFLOW || "workflow";
  const { annotations, summary } = preflight(process.argv.slice(2), process.env, workflow);
  for (const line of annotations) console.log(line);
  if (!annotations.length) console.log(summary.trim());
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
    } catch (err) {
      console.log(`::warning::credential-preflight could not write the step summary: ${err.message}`);
    }
  }
  process.exit(0);
}
