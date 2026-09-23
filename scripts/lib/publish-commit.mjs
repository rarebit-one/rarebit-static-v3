// Shared publish helper — CREATE A BRANCH + A SIGNED COMMIT ON IT.
//
// Used by every workflow that lands generated content through an `auto-land`
// PR: field-notes.yml, drift-actor.yml, voice-actor.yml (issue #384).
//
// Why this exists instead of `git commit && git push`:
//
// `main` is covered by the `main protection` ruleset, which sets
// `required_signatures: true`. A plain `git commit` inside a GitHub Actions
// runner is UNSIGNED (there is no key on the runner), so every PR such a
// workflow produced was born unmergeable — it sat `blocked` with all required
// contexts GREEN and no unresolved review threads, i.e. with NOTHING red to
// click on. That is the expensive kind of failure: it looks like a mystery
// policy problem rather than a missing signature.
//
// GraphQL `createCommitOnBranch` is the ONLY GitHub API that signs the commit
// it creates (server-side, with GitHub's own key). The REST contents API and
// the REST git-database API (blobs → tree → commit) do NOT sign, so switching
// to either would not help. Do not "simplify" this back to `git commit`.
//
// The commit is attributed to whoever owns the token, which stays AUTOLAND_PAT
// (a real user) so the branch push still triggers CI + review/clear on the
// opened PR — the same reason the workflows check out with that PAT.
//
// Inputs (argv):  [2] branch name, [3] base sha, [4] message, [5..] file paths
//                 (repo-relative). A path that exists on disk is committed with
//                 its current contents; a path that no longer exists is
//                 committed as a deletion.
// Env:            GITHUB_REPOSITORY, AUTOLAND_PAT
// Output (stdout): the new commit oid
//
// Fails LOUDLY (exit 1). This is a publish path — a silent failure here would
// mean "the change quietly never shipped", which is the failure mode these
// pipelines are built to avoid.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

/**
 * Build the `fileChanges` input for createCommitOnBranch from a list of
 * repo-relative paths. Pure apart from the injected `exists`/`read` IO so it
 * can be unit-tested without touching disk.
 */
export async function buildFileChanges(
  paths,
  { exists = existsSync, read = readFile } = {},
) {
  const additions = [];
  const deletions = [];
  for (const path of [...new Set(paths)]) {
    if (exists(path)) {
      const contents = Buffer.from(await read(path)).toString("base64");
      additions.push({ path, contents });
    } else {
      deletions.push({ path });
    }
  }
  const fileChanges = {};
  if (additions.length) fileChanges.additions = additions;
  if (deletions.length) fileChanges.deletions = deletions;
  return fileChanges;
}

async function main() {
  const [, , branch, baseSha, message, ...paths] = process.argv;
  const REPO = process.env.GITHUB_REPOSITORY;
  const TOKEN = process.env.AUTOLAND_PAT;

  if (!branch || !baseSha || !message || paths.length === 0) {
    throw new Error(
      "usage: publish-commit.mjs <branch> <base-sha> <message> <file-path>...",
    );
  }
  if (!REPO) throw new Error("GITHUB_REPOSITORY is not set");
  if (!TOKEN) throw new Error("AUTOLAND_PAT is not set");

  const HEADERS = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "rarebit-publish-commit",
    "Content-Type": "application/json",
  };

  async function gh(path, body) {
    const response = await fetch(`https://api.github.com${path}`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(
        `GitHub ${path} → ${response.status} ${await response.text()}`,
      );
    }
    return response.json();
  }

  // Read the changes BEFORE creating the ref, so a bad path fails without
  // leaving an empty branch behind.
  const fileChanges = await buildFileChanges(paths);

  // 1. Create the branch ref at the checked-out base commit. createCommitOnBranch
  //    commits ONTO an existing branch, so the ref has to exist first. Branch
  //    names carry the run id, so a same-day re-run cannot collide here.
  await gh(`/repos/${REPO}/git/refs`, {
    ref: `refs/heads/${branch}`,
    sha: baseSha,
  });

  // 2. Commit onto it. `expectedHeadOid` makes this a compare-and-swap: if
  //    anything else moved the branch between step 1 and here, the mutation
  //    fails rather than silently clobbering it.
  const [headline, ...rest] = message.split("\n");

  const result = await gh("/graphql", {
    query: `
      mutation ($input: CreateCommitOnBranchInput!) {
        createCommitOnBranch(input: $input) {
          commit { oid }
        }
      }
    `,
    variables: {
      input: {
        branch: { repositoryNameWithOwner: REPO, branchName: branch },
        expectedHeadOid: baseSha,
        message: { headline, body: rest.join("\n").trim() || undefined },
        fileChanges,
      },
    },
  });

  // GraphQL reports application errors in a 200 body, so an `ok` response is
  // not on its own proof the commit exists.
  if (result.errors?.length) {
    throw new Error(`createCommitOnBranch: ${JSON.stringify(result.errors)}`);
  }

  const oid = result.data?.createCommitOnBranch?.commit?.oid;
  if (!oid) {
    throw new Error(
      `createCommitOnBranch returned no commit: ${JSON.stringify(result)}`,
    );
  }

  process.stdout.write(oid);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
