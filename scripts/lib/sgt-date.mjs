// The farm's calendar day. The farm runs on Singapore time (UTC+8, no DST), so
// every date a pipeline WRITES (a VOICE.md changelog entry, a proposal title)
// and every "today" a gate CHECKS against must come from this one helper.
//
// Mixing clocks is a real bug (#866): voice-actor runs Sundays ~21:06 UTC,
// which is already Monday in SGT. draft.mjs dated the entry in SGT while the
// review-verdict rubric told the model "today" in UTC, so every weekly voice PR
// opened after 16:00 UTC looked future-dated and was blocked.

export const SGT_OFFSET_MS = 8 * 3600_000;

/** YYYY-MM-DD for the SGT calendar day containing `now` (ms epoch or Date). */
export function sgtDate(now = Date.now()) {
  return new Date(Number(now) + SGT_OFFSET_MS).toISOString().slice(0, 10);
}
