# Contact: MCP server and inquiry form

Moved verbatim from the old `CLAUDE.md` ("Conventions"); the rules that must hold are summarised in [`AGENTS.md`](../../AGENTS.md).

- **Contact is MCP-first, form-fallback.** All CTAs route to `/connect`, which documents the
  MCP endpoint (`https://rarebit.one/mcp`) and carries an inquiry form for users who can't add
  an MCP connector (assistants only allow that on web/desktop, so mobile needs the form); email
  is the last resort. Both are DO Functions in the same app under `functions/packages/mcp/`:
  `server/index.mjs` (zero-dependency Streamable HTTP JSON-RPC, canned content +
  `submit_inquiry`) and `inquiry/index.mjs` (plain POST for the form, ingress `/inquiry`).
  Both open a labeled `inquiry` issue in `rarebit-one/rarebit-ops` and need `GITHUB_TOKEN`
  (fine-grained PAT, Issues read/write on rarebit-ops only) + `GITHUB_REPO` env vars at runtime
  (declared in `functions/project.yml`). Smoke-test locally by importing `main` and posting
  envelopes. The MCP server's `open_source` canned content mirrors the /open-source page —
  keep them in sync. NB: app-spec changes (`.do/app.yaml` — ingress, envs) don't apply on
  push, and **never apply that file raw**: `doctl apps update --spec` is a full-spec replace
  and the committed file deliberately omits the GITHUB_TOKEN secret — applying it verbatim
  wipes the token and breaks all subsequent deploys. Merge changes into the live spec
  (`doctl apps spec get`) instead; see the warning header in `.do/app.yaml`.
