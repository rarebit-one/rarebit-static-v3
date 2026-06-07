// Regenerates the MCP server's open_source canned content from the catalog
// in src/data/openSource.data.mjs — the page and the MCP tool can no longer
// drift (they did once, by hand). Run via `npm run sync:mcp`; CI fails when
// the committed output is stale.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openSourceCatalog } from "../src/data/openSource.data.mjs";

const TARGET = fileURLToPath(new URL("../functions/packages/mcp/server/index.mjs", import.meta.url));
const BEGIN = "// BEGIN GENERATED: open_source canned content — edit src/data/openSource.data.mjs, then `npm run sync:mcp`";
const END = "// END GENERATED: open_source canned content";

const sections = openSourceCatalog
  .map((category) => {
    const repos = category.repos
      .map((repo) => `- **${repo.repo}** — ${repo.mcpSummary}`)
      .join("\n");
    return `## ${category.title} (${category.mcpLabel})\n${repos}`;
  })
  .join("\n\n");

const content = `# Rarebit open source

The primitives the farm runs on, released as focused Ruby gems.
All at https://github.com/rarebit-one/<repo>.

${sections}`;

const block = `${BEGIN}\nconst OPEN_SOURCE = ${JSON.stringify(content)};\n${END}`;

const source = readFileSync(TARGET, "utf8");
const beginAt = source.indexOf(BEGIN);
const endAt = source.indexOf(END);
if (beginAt === -1 || endAt === -1) {
  console.error(`sync:mcp — generation markers not found in ${TARGET}`);
  process.exit(1);
}

const next = source.slice(0, beginAt) + block + source.slice(endAt + END.length);
if (next === source) {
  console.log("sync:mcp — already in sync");
} else {
  writeFileSync(TARGET, next);
  console.log("sync:mcp — regenerated OPEN_SOURCE canned content");
}
