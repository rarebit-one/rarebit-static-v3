// Field-notes pipeline · step 3 of 3 — VALIDATE + ASSEMBLE (deterministic).
//
// The closing half of the "digest sandwich", and — because the workflow
// auto-commits the result to main with NO human review between draft and
// publish — the SOLE GATE before publication. The drafter is trusted only to
// phrase; this script decides what may ship. It HARD-FAILS (exit 1, nothing
// written) if the draft contains anything that could leak a client or break a
// link:
//   1. any private blocklist identifier (private repo names, member logins)
//   2. any URL not on the allowlist built from the facts (public PR/release
//      URLs, https://github.com/rarebit-one/<public-repo>, https://rarebit.one)
//   3. any email address or @handle
//   4. any /field-notes/<slug>/ link that resolves to neither a past note nor
//      this note's own slug (no dead internal links)
//   5. a malformed shape (empty fields, non-kebab slug)
//   6. any hype term VOICE.md bans by name (plus exclamation marks / emoji),
//      unless it was quoted from a fact the drafter was given
//
// A "thin week" (no public PRs/releases AND no private events) is a benign
// no-op, not a failure — we don't invent filler.
//
// On pass it assembles the markdown file (frontmatter + body) and writes it.
//
// Inputs:  argv[2] facts.json, argv[3] draft.json
// Output:  argv[4] (default src/content/field-notes/<slug>.md)

import { existsSync, writeFileSync, readFileSync } from "node:fs";

const FACTS = process.argv[2] ?? "facts.json";
const DRAFT = process.argv[3] ?? "draft.json";
const OUT_ARG = process.argv[4]; // explicit path or directory; default derived below

const facts = JSON.parse(readFileSync(FACTS, "utf8"));
const draft = JSON.parse(readFileSync(DRAFT, "utf8"));

const fail = (reason) => {
  console.error(`validate: REJECTED — ${reason}. Nothing published; previous notes stand.`);
  process.exit(1);
};

// Match a blocklisted identifier only as a whole token — not as a substring of a
// longer identifier. Without this, the PRIVATE repo "rarebit-static" matches inside
// the PUBLIC "rarebit-static-v3" this site is about (a guaranteed false positive).
function containsIdentifier(haystackLower, termLower) {
  const idChar = /[a-z0-9_-]/; // chars that continue a repo/login identifier
  for (let from = 0; ; ) {
    const i = haystackLower.indexOf(termLower, from);
    if (i === -1) return false;
    const before = i > 0 ? haystackLower[i - 1] : "";
    const after = i + termLower.length < haystackLower.length ? haystackLower[i + termLower.length] : "";
    const boundedLeft = !before || !idChar.test(before);
    const boundedRight = !after || !idChar.test(after);
    if (boundedLeft && boundedRight) return true;
    from = i + 1;
  }
}

// --- THIN-WEEK NO-OP (not a failure) ---------------------------------------
// If there's nothing worth a note, exit 0 without writing — mirrors farm-feed's
// empty-day handling. We never force filler ("never invent metrics").
const prs = facts.public?.prs ?? [];
const releases = facts.public?.releases ?? [];
const privateEvents = facts.private?.events ?? [];
if (prs.length === 0 && releases.length === 0 && privateEvents.length === 0) {
  console.log("validate: thin week (no public PRs/releases, no private events) — skipping (not a rejection).");
  process.exit(0);
}

// --- SHAPE gate (5) — check before scanning so errors are clear -------------
for (const field of ["title", "description", "slug", "body"]) {
  if (typeof draft[field] !== "string" || draft[field].trim() === "") {
    fail(`draft field "${field}" is missing or empty`);
  }
}
if (!/^[a-z0-9-]+$/.test(draft.slug)) fail(`slug "${draft.slug}" is not kebab-case`);

// The scan blob — everything the model produced.
const blob = [draft.title, draft.description, draft.body].join("\n");
const blobLower = blob.toLowerCase();

// --- 1. BLOCKLIST — private identifiers must never appear -------------------
// Guard trivially short terms (a 2-char repo name would false-positive).
for (const term of facts.private?.blocklist ?? []) {
  const t = String(term).toLowerCase().trim();
  if (t.length >= 3 && containsIdentifier(blobLower, t)) {
    fail(`output contains blocklisted identifier "${term}"`);
  }
}

// --- 3. EMAIL / @handle — none belong in a public note ----------------------
// (Checked before URLs so an email isn't mistaken for a bare token.)
if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(blob)) fail("output contains an email address");
// @handle in ANY non-word position — start, or after whitespace/punctuation
// (",@user", "/@user", "[@user"). A bare [\s(] class missed those. Emails are
// caught above; "." before @ is excluded so this doesn't double-flag them.
if (/(^|[^\w.])@\w/.test(blob)) fail("output contains an @handle");

// --- 2. URL ALLOWLIST — every URL must trace to the facts -------------------
const allowedPrefixes = new Set(["https://rarebit.one"]);
for (const pr of prs) if (pr.url) allowedPrefixes.add(pr.url);
for (const rel of releases) if (rel.url) allowedPrefixes.add(rel.url);
for (const repo of facts.public?.repos ?? []) {
  allowedPrefixes.add(`https://github.com/rarebit-one/${repo}`);
}
// A URL matches a prefix only at a real boundary — exact match, or the next
// char is a path/query/fragment separator. This rejects look-alikes like
// "https://rarebit.one.evil.com" that a bare startsWith() would wave through.
const matchesPrefix = (url, prefix) => {
  if (!url.startsWith(prefix)) return false;
  if (url.length === prefix.length) return true;
  return ["/", "?", "#"].includes(url[prefix.length]);
};
const urls = blob.match(/https?:\/\/[^\s)\]<>"']+/gi) ?? [];
for (const rawUrl of urls) {
  const url = rawUrl.replace(/[.,;:]+$/, ""); // trailing punctuation isn't part of the URL
  const ok = [...allowedPrefixes].some((prefix) => matchesPrefix(url, prefix));
  if (!ok) fail(`output contains off-allowlist URL "${url}"`);
}

// --- 4. INTERNAL LINKS — every /field-notes/<slug>/ must resolve ------------
const knownSlugs = new Set([draft.slug, ...(facts.pastNotes ?? []).map((n) => n.slug)]);
for (const match of blob.matchAll(/\/field-notes\/([a-z0-9-]+)\/?/g)) {
  const slug = match[1];
  if (!knownSlugs.has(slug)) fail(`output links to unknown field note "/field-notes/${slug}/"`);
}

// --- 6. VOICE LEXICON — the enumerated hype bans, verbatim ------------------
// VOICE.md's hard rules name specific forbidden tokens ("powerful", "seamless",
// "robust", "cutting-edge", "revolutionary", "game-changing", "world-class"), no
// exclamation marks and no emoji, and the Lexicon adds an Avoid list. Because
// that list is CLOSED and LITERAL — the voice contract itself enumerates these
// words — checking for them deterministically is high-precision by construction.
//
// Deliberately NOT checked: the softer promotional framing that a drafter
// actually reaches for ("significant", "solidifies", "enhancing the security
// and functionality of...", benefit clauses bolted onto a fact). Those are
// ordinary English whose offence is contextual, so a regex for them would
// reject legitimate prose far more often than it caught a violation. They are
// addressed in draft.mjs's prompt and by the `review/clear` gate, which reads
// the diff with judgement. Same reason "leverage" and "solution" are absent:
// VOICE.md bans them only "as a verb" / "as filler", which a scan cannot tell.
const HYPE_TERMS = [
  // VOICE.md hard rule — marketing adjectives, enumerated there verbatim.
  "powerful", "seamless", "robust", "cutting-edge", "revolutionary",
  "game-changing", "world-class",
  // VOICE.md Lexicon "Avoid" — only the unambiguous, non-colliding entries.
  "synergy", "supercharge", "effortless", "ai-powered", "next-generation",
  // Excluded on purpose from that same Avoid list: "unlock", "magic" and
  // "disrupt" all have ordinary technical senses this repo's subject matter
  // invites ("account unlock" in an auth engine, "magic comments" in Ruby, "the
  // run was disrupted"), so gating them would reject correct prose. They stay
  // with the prompt. The five kept above have no such technical sense.
];

// A hype word is only the drafter's fault if the drafter invented it. If it
// appears in a fact it was given — a real PR title, a release name, a repo name
// — quoting it is grounded, and rejecting the whole week's note over it would be
// a false positive. Build that grounded corpus and exempt anything inside it.
//
// THIS WEEK's facts only. Past notes are deliberately excluded: they are prior
// output, not grounding, and including them would ratchet — one hype term
// legitimately published in a note's title would exempt that term for every
// future week.
const groundedStrings = [
  ...prs.flatMap((pr) => [pr.title, pr.repo]),
  ...releases.flatMap((rel) => [rel.name, rel.tag, rel.repo]),
  ...(facts.public?.repos ?? []),
].filter((s) => typeof s === "string" && s.trim() !== "");

const groundedCorpus = groundedStrings.join("\n").toLowerCase();

// Match on a word boundary, tolerating the ordinary inflections a drafter would
// reach for ("robustness", "supercharged", "seamlessly") — the ban is on the
// word, not one spelling of it. Unlike the blocklist above, a hyphen here IS a
// boundary: "cutting-edge" is the term, and no legitimate identifier ends in one
// of these words.
const hypePattern = (term) =>
  new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:s|es|d|ed|ly|ness)?\\b`, "gi");

const countMatches = (haystack, re) => (haystack.match(re) ?? []).length;

// The exemption is PROPORTIONAL, not global: a fact mentioning "robust" once
// buys the note exactly one "robust". A second, unbudgeted occurrence is the
// drafter's own and fails. This is deliberately looser than requiring a
// verbatim quotation — the drafter usually paraphrases a PR title rather than
// quoting it ("made projections more robust" vs. the title's wording), and a
// false positive here silently drops the ENTIRE week's note, whereas a miss is
// still caught by draft.mjs's prompt and the `review/clear` gate. Counting
// occurrences keeps the common paraphrase working while removing the
// "one grounded mention disables this term everywhere" hole.
for (const term of HYPE_TERMS) {
  const used = countMatches(blob, hypePattern(term));
  if (used === 0) continue;
  const budget = countMatches(groundedCorpus, hypePattern(term));
  if (used <= budget) continue; // within what the facts themselves mention
  fail(`output contains the hype term "${term}", which VOICE.md forbids outright`);
}

// Exclamation marks and emoji are banned outright by the same hard rule, and
// need the same grounding exemption — a PR title may legitimately carry one.
// But unlike a hype term there is no "word" to scope the exemption by, so a
// corpus-wide boolean would be far too coarse: a single "!" anywhere in the
// facts would wave through an unrelated invented "!" anywhere in the body.
// Instead, MASK every grounded string that the draft quotes verbatim, then scan
// only what is left — i.e. only text the drafter actually invented.
let ungrounded = blob;
for (const s of groundedStrings) {
  if (s.length < 3) continue; // too short to be a meaningful quotation
  ungrounded = ungrounded.split(s).join(" ");
}

if (ungrounded.includes("!")) {
  fail("output contains an exclamation mark, which VOICE.md forbids outright");
}
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}]/u;
if (EMOJI.test(ungrounded)) {
  fail("output contains an emoji, which VOICE.md forbids outright");
}

// --- ON PASS — assemble the markdown ---------------------------------------
// pubDate: now, as ISO 8601 with the +08:00 (SGT) offset.
const now = new Date(Date.now() + 8 * 3600_000);
const pubDate = `${now.toISOString().slice(0, 19)}+08:00`;

const markdown = `---
title: "${draft.title.replace(/"/g, '\\"')}"
description: "${draft.description.replace(/"/g, '\\"')}"
pubDate: ${pubDate}
---

${draft.body.trim()}
`;

// Resolve the output path. argv[4] may be an explicit file, a directory, or
// absent (default the content collection). If the target file already exists,
// suffix with the window end date to avoid clobbering.
function resolveOutPath() {
  const slugFile = `${draft.slug}.md`;
  if (OUT_ARG && OUT_ARG.endsWith(".md")) return OUT_ARG;
  const dir = (OUT_ARG ?? "src/content/field-notes").replace(/\/$/, "");
  let path = `${dir}/${slugFile}`;
  if (existsSync(path)) path = `${dir}/${draft.slug}-${facts.window.to}.md`;
  return path;
}

const outPath = resolveOutPath();
writeFileSync(outPath, markdown);
console.log(`validate: PASSED — "${draft.title}" written to ${outPath} (window ${facts.window.from}..${facts.window.to})`);
