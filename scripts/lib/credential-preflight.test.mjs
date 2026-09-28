// Locks the loud-no-op contract (#355): a missing credential yields a warning
// annotation + an UNVERIFIED summary line naming it; present ones are silent;
// the secret's value never appears in the output.
import { test } from "node:test";
import assert from "node:assert/strict";
import { preflight } from "./credential-preflight.mjs";

test("missing credential → warning + UNVERIFIED summary naming it and the consequence", () => {
  const r = preflight(["OPENAI_API_KEY|no draft is generated", "AUTOLAND_PAT|no PR is opened"], {
    OPENAI_API_KEY: "sk-secret-value",
    AUTOLAND_PAT: "",
  }, "Drift actor");
  assert.deepEqual(r.missing.map((m) => m.name), ["AUTOLAND_PAT"]);
  assert.equal(r.annotations.length, 1);
  assert.match(r.annotations[0], /^::warning title=Drift actor%3A credential missing::AUTOLAND_PAT is unset — no PR is opened/);
  assert.match(r.summary, /UNVERIFIED/);
  assert.match(r.summary, /`AUTOLAND_PAT` unset — no PR is opened; nothing published/);
  assert.ok(!r.summary.includes("sk-secret-value"));
  assert.ok(!r.annotations.join("").includes("sk-secret-value"));
});

test("all present → no annotations, affirmative summary", () => {
  const r = preflight(["OPENAI_API_KEY|x"], { OPENAI_API_KEY: "v" }, "Voice actor");
  assert.equal(r.annotations.length, 0);
  assert.doesNotMatch(r.summary, /UNVERIFIED/);
});

test("whitespace-only and undefined count as missing", () => {
  const r = preflight(["A|a", "B|b"], { A: "   " }, "w");
  assert.deepEqual(r.missing.map((m) => m.name), ["A", "B"]);
});

test("degraded spec says the run continued, never that it published nothing", () => {
  const r = preflight(["FEED_GITHUB_PAT|gather falls back to GITHUB_TOKEN|degraded"], {}, "Field notes");
  assert.match(r.annotations[0], /continues DEGRADED/);
  assert.doesNotMatch(r.annotations[0], /publishes nothing/);
  assert.match(r.summary, /UNVERIFIED — Field notes ran degraded/);
  assert.doesNotMatch(r.summary, /nothing published/);
});

test("a no-op spec alongside a degraded one keeps the no-op heading", () => {
  const r = preflight(["FEED_GITHUB_PAT|x|degraded", "OPENAI_API_KEY|y"], {}, "Field notes");
  assert.match(r.summary, /ran as a no-op/);
  assert.match(r.summary, /`FEED_GITHUB_PAT` unset — x; continuing degraded/);
  assert.match(r.summary, /`OPENAI_API_KEY` unset — y; nothing published/);
});
