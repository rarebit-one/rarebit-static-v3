// Typed surface over the open-source catalog. The data itself lives in
// openSource.data.mjs (plain JS) so scripts/sync-mcp-open-source.mjs can
// import it without a TypeScript loader; this wrapper type-checks it.

import { openSourceCatalog as data } from "./openSource.data.mjs";

export type Repo = {
  name: string;
  repo: string;
  kind: string; // "Ruby gem"
  version: string;
  description: string;
  /** One-line phrasing used by the MCP server's open_source canned content. */
  mcpSummary: string;
  body: string;
  bullets?: string[];
};

export type RepoCategory = {
  id: string;
  title: string;
  /** Stack label shown in the MCP canned content heading. */
  mcpLabel: string;
  repos: Repo[];
};

export const openSourceCatalog: RepoCategory[] = data;
