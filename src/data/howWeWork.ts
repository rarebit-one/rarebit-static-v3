// Evergreen prose for the /how-we-work case study. The page itself is a thin
// renderer over this data; the live stats strip is wired in the .astro from
// farm.ts fetchers. Voice: calm, factual, receipts over adjectives, quietly
// self-aware (this very page is the farm's own output). Never name clients.

export const howWeWork = {
  meta: {
    title: "How we work — Rarebit",
    description:
      "A case study in the farm building itself: one operator, parallel agents on isolated worktrees, a deterministic content pipeline, signed commits, and gated auto-land. The same automations that run Rarebit run our client work.",
  },

  hero: {
    tag: "Small teams. Impossible things.",
    title: "How the farm works",
    text: "This is not a pitch deck. It is a description of the system that produced this page — the same one that runs our client work. Agents do the work; a human directs and reviews; the pipeline ships.",
  },

  // The arc — each step drawn from a real mechanism in this repo and the org.
  steps: [
    {
      id: "lead",
      tag: "01 · The operator",
      title: "One human, holding the thread",
      body: "A single operator sets direction, reviews what matters, and signs off on what ships. There is no middle layer to brief, chase, or wait on. The leverage of an agency without the agency — because the queue is worked by agents, not headcount.",
    },
    {
      id: "worktrees",
      tag: "02 · Parallel by default",
      title: "Agents on isolated worktrees",
      body: "Work runs in parallel on isolated git worktrees — each agent on its own branch, its own checkout, its own task. They don't trip over each other, and nothing touches the main line until it's reviewed. This page was built that way, in a worktree, off main.",
    },
    {
      id: "pipeline",
      tag: "03 · The digest sandwich",
      title: "Gather, draft, validate",
      body: "Content that comes off the farm — field notes, the operations feed — runs through a strict three-step sandwich. A deterministic gather step collects only the facts. Exactly one model call phrases them. A deterministic validator is the gate: it hard-fails on anything that could identify a client, then writes what publishes. The model phrases; it never decides what is safe to say.",
    },
    {
      id: "ship",
      tag: "04 · How it ships",
      title: "Signed, reviewed, then it lands itself",
      body: "Every commit is cryptographically signed. CI runs the checks. Pull requests are reviewed — and once a reviewed PR is green, it merges itself. The human decision is the review, not the button. Receipts, not adjectives: the merges below are real, public, and linkable.",
    },
    {
      id: "contact",
      tag: "05 · The front door",
      title: "MCP-first contact",
      body: "The cleanest way to reach the farm is the same protocol agents speak. The site exposes an MCP endpoint an assistant can connect to directly; a form and email are there for everyone else. Start a conversation the way the work actually happens.",
    },
  ],

  close: {
    title: "The same farm, pointed at your work",
    text: "Everything above runs Rarebit. None of it is bespoke for this site. When we take on client work, we point the same agents, the same worktrees, the same pipeline, and the same review gate at your queue — inside the tools your team already uses.",
    cta: "Start a conversation",
  },
};
