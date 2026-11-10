// Tests for the shared SGT calendar-day helper (#866). The voice changelog date
// (draft.mjs / validate.mjs) and the review-verdict gate's "today" must agree;
// both derive it from sgtDate(), so lock its behaviour across the UTC/SGT
// day boundary and lock that the gates actually use it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sgtDate } from "./sgt-date.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("before 16:00 UTC the SGT day equals the UTC day", () => {
  assert.equal(sgtDate(Date.parse("2026-11-08T15:59:59Z")), "2026-11-08");
});

test("from 16:00 UTC the SGT day is the next calendar day", () => {
  assert.equal(sgtDate(Date.parse("2026-11-08T16:00:00Z")), "2026-11-09");
});

test("the Sunday voice-actor slot (21:06 UTC) is Monday in SGT", () => {
  // The exact case from #866: run 42523514561 blocked #862 as future-dated.
  assert.equal(sgtDate(Date.parse("2026-11-08T21:06:00Z")), "2026-11-09");
});

test("rolls over month and year boundaries", () => {
  assert.equal(sgtDate(Date.parse("2026-12-31T16:30:00Z")), "2027-01-01");
  assert.equal(sgtDate(Date.parse("2026-11-30T23:00:00Z")), "2026-12-01");
});

test("accepts a Date and defaults to now", () => {
  assert.equal(sgtDate(new Date("2026-11-08T21:06:00Z")), "2026-11-09");
  assert.match(sgtDate(), /^\d{4}-\d{2}-\d{2}$/);
});

// The writer and the gates must share one clock. A source check is the only
// way to cover review-verdict.mjs, which runs its gate at import time.
for (const rel of ["scripts/voice/draft.mjs", "scripts/voice/validate.mjs", ".github/scripts/review-verdict.mjs"]) {
  test(`${rel} derives today from sgtDate()`, () => {
    const src = readFileSync(join(root, rel), "utf8");
    assert.match(src, /import \{ sgtDate \} from "[./]+\/(scripts\/)?lib\/sgt-date\.mjs";/);
    assert.doesNotMatch(src, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/, "UTC calendar day used as today");
  });
}
