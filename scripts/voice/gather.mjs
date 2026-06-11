// Voice-evolution pipeline · step 1 of 3 — GATHER (public, deterministic, robust).
//
// Reads what the frontier AI labs published recently from a small ALLOWLIST of
// public news/research pages, strips the HTML to visible text, and keeps the
// first ~4KB per source as "recent signal". This is the only input the drafter
// (step 2) is grounded in, alongside the current VOICE.md.
//
// Robustness is the whole point: each source is fetched in its own try/catch.
// A blocked, slow, or 404'd source is SKIPPED — it never crashes the run. If
// ALL sources fail we still emit a valid signal.json with an empty `sources`
// array, and the drafter no-ops on empty signal. No secret is needed here; the
// allowlist is public.
//
// Output: writes signal.json to the path in argv[2] (default ./signal.json),
//         shape { generated, sources: [{ url, host, text }] }.

import { writeFileSync } from "node:fs";

const OUT = process.argv[2] ?? "signal.json";

// Frontier-lab public sources. Deliberately a short, hand-curated allowlist of
// pages that summarize what labs shipped — never a crawl. Add sparingly.
const ALLOWLIST = [
  "https://www.anthropic.com/news",
  "https://www.anthropic.com/research",
  "https://openai.com/news",
  "https://deepmind.google/discover/blog/",
  "https://ai.meta.com/blog/",
];

const PER_SOURCE_BYTES = 4096; // ~4KB of visible text per source
const FETCH_TIMEOUT_MS = 15_000;

// Strip tags + script/style blocks, decode a few common entities, collapse
// whitespace. Best-effort — we only need readable signal, not fidelity.
function htmlToText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchSource(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        // A plain UA; some lab pages 403 a missing one.
        "User-Agent": "rarebit-voice-evolution (+https://rarebit.one)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const text = htmlToText(html).slice(0, PER_SOURCE_BYTES);
    if (!text) throw new Error("no visible text");
    return { url, host: new URL(url).host, text };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const sources = [];
  for (const url of ALLOWLIST) {
    try {
      sources.push(await fetchSource(url));
      console.log(`gather: ok ${url}`);
    } catch (error) {
      // A failed/blocked source is skipped, never fatal.
      console.log(`gather: skipped ${url} — ${error.message}`);
    }
  }

  const signal = { generated: new Date().toISOString(), sources };
  writeFileSync(OUT, JSON.stringify(signal, null, 2));

  if (sources.length === 0) {
    console.log(`gather: ALL sources failed — wrote empty signal (${OUT}); drafter will no-op.`);
  } else {
    console.log(`gather: ${sources.length}/${ALLOWLIST.length} sources captured → ${OUT}`);
  }
}

main().catch((error) => {
  // Even an unexpected error must leave a valid (empty) signal so the workflow
  // stays green and the drafter no-ops rather than the run going red.
  console.error(`gather: ${error.message} — writing empty signal.`);
  writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), sources: [] }, null, 2));
});
