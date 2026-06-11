// Shared voice loader. VOICE.md (repo root) is the canonical voice of rarebit.one; the
// block between the VOICE-HEADER markers is the machine-distilled version that the content
// pipelines embed in their LLM system prompts, so a voice change in one place propagates to
// everything the farm generates. See VOICE.md.

import { readFileSync } from "node:fs";

const START = "<!-- VOICE-HEADER:START -->";
const END = "<!-- VOICE-HEADER:END -->";

/** The distilled voice header, extracted from VOICE.md, for embedding in a system prompt. */
export function voiceHeader() {
  // Resolve relative to this module so it works regardless of the caller's CWD.
  const path = new URL("../../VOICE.md", import.meta.url);
  const md = readFileSync(path, "utf8");
  const start = md.indexOf(START);
  const end = md.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("voice: VOICE-HEADER markers not found in VOICE.md");
  }
  const header = md.slice(start + START.length, end).trim();
  if (!header) throw new Error("voice: VOICE-HEADER block is empty in VOICE.md");
  return header;
}
