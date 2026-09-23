// Unit tests for the PURE part of publish-commit.mjs: mapping changed paths to
// createCommitOnBranch `fileChanges`. No network — the GraphQL call itself is
// covered by integration (verify the produced commit's `verification`).

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFileChanges } from "./publish-commit.mjs";

const fakeFs = (files) => ({
  exists: (p) => Object.hasOwn(files, p),
  read: async (p) => Buffer.from(files[p]),
});

test("existing paths become base64 additions", async () => {
  const changes = await buildFileChanges(
    ["VOICE.md"],
    fakeFs({ "VOICE.md": "hello\n" }),
  );
  assert.deepEqual(changes, {
    additions: [
      { path: "VOICE.md", contents: Buffer.from("hello\n").toString("base64") },
    ],
  });
});

test("missing paths become deletions", async () => {
  const changes = await buildFileChanges(["gone.md"], fakeFs({}));
  assert.deepEqual(changes, { deletions: [{ path: "gone.md" }] });
});

test("mixed additions + deletions, duplicates collapsed", async () => {
  const changes = await buildFileChanges(
    ["a.md", "b.md", "a.md"],
    fakeFs({ "a.md": "A" }),
  );
  assert.equal(changes.additions.length, 1);
  assert.equal(changes.additions[0].path, "a.md");
  assert.deepEqual(changes.deletions, [{ path: "b.md" }]);
});
