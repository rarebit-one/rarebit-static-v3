// Farm-feed pipeline · step 3 of 3 — VALIDATE + ASSEMBLE (deterministic).
//
// The closing half of the "digest sandwich". The LLM is trusted only to
// phrase; this script is the safety gate that decides what may be published.
// It HARD-FAILS (exit 1, nothing published) if the phrased output contains
// anything that could identify a client:
//   - any blocklist string (private repo names, org member logins)
//   - URLs, emails, @handles
//   - any number not present in the sanitized totals (catches hallucinated
//     "served N clients" style fabrications)
//
// On pass it assembles the final replay artifact by pairing each sanitized
// event with a phrase template for its category — so the published per-event
// text comes from the (validated) template set, never free-form model output.
//
// Inputs:  argv[2] sanitized.json, argv[3] phrased.json
// Output:  argv[4] (default ./farm-replay.json)

import { readFileSync, writeFileSync } from "node:fs";

const SANITIZED = process.argv[2] ?? "sanitized.json";
const PHRASED = process.argv[3] ?? "phrased.json";
const OUT = process.argv[4] ?? "farm-replay.json";

const sanitized = JSON.parse(readFileSync(SANITIZED, "utf8"));
const phrased = JSON.parse(readFileSync(PHRASED, "utf8"));

const fail = (reason) => {
  console.error(`validate: REJECTED — ${reason}. Nothing published; previous artifact stands.`);
  process.exit(1);
};

// Every string the model produced, flattened for scanning.
const haystacks = [
  phrased.digest ?? "",
  ...Object.values(phrased.phrases ?? {}).flat(),
].map((s) => String(s));
const blob = haystacks.join("\n");
const blobLower = blob.toLowerCase();

// 1. Blocklist — private repo names + org member logins must never appear.
//    Guard against trivial substrings (a 2-char repo name would false-positive).
for (const term of sanitized.blocklist ?? []) {
  const t = String(term).toLowerCase().trim();
  if (t.length >= 3 && blobLower.includes(t)) {
    fail(`output contains blocklisted identifier "${term}"`);
  }
}

// 2. URLs / emails / @handles — none belong in a generic ticker.
if (/https?:\/\/|www\.|@\w/i.test(blob)) fail("output contains a URL, email, or @handle");

// 3. Numbers — only those present in totals are allowed (digest may cite the
//    run count, system count, or green %). Any other number is a fabrication.
const allowed = new Set(
  Object.values(sanitized.totals ?? {}).map((n) => String(n))
);
for (const num of blob.match(/\d+/g) ?? []) {
  if (!allowed.has(num)) fail(`output contains number "${num}" not present in sanitized totals`);
}

// 4. Assemble — pair each sanitized event with a template for its category.
//    Templates are the validated strings; outcome suffix is added here.
const variantCursor = new Map();
const pickTemplate = (category) => {
  const variants = phrased.phrases?.[category];
  if (!Array.isArray(variants) || variants.length === 0) return category;
  const i = variantCursor.get(category) ?? 0;
  variantCursor.set(category, i + 1);
  return variants[i % variants.length];
};

const events = (sanitized.events ?? []).map((event) => {
  const base = pickTemplate(event.category);
  const count = event.count > 1 ? ` ×${event.count}` : "";
  const outcome = event.ok ? "" : " · failed";
  return {
    at: event.at,
    kind: event.category,
    text: `${base}${count}${outcome}`,
    ok: event.ok,
  };
});

if (events.length === 0) fail("no events to publish");

const artifact = {
  generated: new Date().toISOString(),
  window: sanitized.window,
  digest: phrased.digest,
  events,
};

writeFileSync(OUT, JSON.stringify(artifact));
console.log(`validate: PASSED — ${events.length} events assembled for window ${sanitized.window} (${OUT})`);
