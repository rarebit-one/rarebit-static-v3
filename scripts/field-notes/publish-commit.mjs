// Field-notes pipeline · publish helper — CREATE THE BRANCH + A SIGNED COMMIT.
//
// Why this exists instead of `git commit && git push`:
//
// `main` is covered by the `main protection` ruleset, which sets
// `required_signatures: true`. A plain `git commit` inside a GitHub Actions
// runner is UNSIGNED (there is no key on the runner), so every note the
// workflow produced was born unmergeable — the PR sat `blocked` with all four
// required contexts GREEN and no unresolved review threads, i.e. with NOTHING
// red to click on. That is the expensive kind of failure: it looks like a
// mystery policy problem rather than a missing signature.
//
// GraphQL `createCommitOnBranch` is the ONLY GitHub API that signs the commit
// it creates (server-side, with GitHub's own key). The REST contents API does
// NOT sign, so switching to it would not have helped.
//
// The commit is attributed to whoever owns the token, which stays AUTOLAND_PAT
// (a real user) so the branch push still triggers CI + review/clear on the
// opened PR — the same reason the workflow checks out with that PAT.
//
// Inputs (argv):  [2] branch name, [3] base sha, [4] file path, [5] message
// Env:            GITHUB_REPOSITORY, AUTOLAND_PAT
// Output (stdout): the new commit oid
//
// Fails LOUDLY (exit 1). This is a publish path — a silent failure here would
// mean "the note quietly never shipped", which is the failure mode the whole
// pipeline is built to avoid.

import { readFile } from "node:fs/promises";

const [, , branch, baseSha, filePath, message] = process.argv;
const REPO = process.env.GITHUB_REPOSITORY;
const TOKEN = process.env.AUTOLAND_PAT;

if (!branch || !baseSha || !filePath || !message) {
  throw new Error(
    "usage: publish-commit.mjs <branch> <base-sha> <file-path> <message>",
  );
}
if (!REPO) throw new Error("GITHUB_REPOSITORY is not set");
if (!TOKEN) throw new Error("AUTOLAND_PAT is not set");

const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "rarebit-field-notes",
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

// 1. Create the branch ref at the checked-out base commit. createCommitOnBranch
//    commits ONTO an existing branch, so the ref has to exist first. The branch
//    name already carries the run id, so a same-day re-run cannot collide here.
await gh(`/repos/${REPO}/git/refs`, {
  ref: `refs/heads/${branch}`,
  sha: baseSha,
});

// 2. Commit the note onto it. `expectedHeadOid` makes this a compare-and-swap:
//    if anything else moved the branch between step 1 and here, the mutation
//    fails rather than silently clobbering it.
const contents = Buffer.from(await readFile(filePath)).toString("base64");
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
      fileChanges: { additions: [{ path: filePath, contents }] },
    },
  },
});

// GraphQL reports application errors in a 200 body, so an `ok` response is not
// on its own proof the commit exists.
if (result.errors?.length) {
  throw new Error(`createCommitOnBranch: ${JSON.stringify(result.errors)}`);
}

const oid = result.data?.createCommitOnBranch?.commit?.oid;
if (!oid) throw new Error(`createCommitOnBranch returned no commit: ${JSON.stringify(result)}`);

process.stdout.write(oid);
