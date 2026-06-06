export const site = {
  name: "Rarebit",
  domain: "rarebit.one",
  title: "Rarebit — One AI. Endless Output.",
  description:
    "Rarebit runs an AI automation farm: agents and automations handle the workflows, humans direct, review, and ship. Small teams. Impossible things.",
  email: "hello@rarebit.one",
  github: "https://github.com/rarebit-one",
};

export const navigation = [
  { id: "0", title: "Automations", url: "/#automations" },
  { id: "1", title: "How we work", url: "/#how-we-work" },
  { id: "2", title: "Operations", url: "/#operations" },
  { id: "3", title: "Roadmap", url: "/#roadmap" },
  { id: "4", title: "Get in touch", url: `mailto:${site.email}`, onlyMobile: true },
];

export const stats = [
  { id: "0", label: "Automations running", value: "47" },
  { id: "1", label: "Tasks per minute", value: "3,842" },
  { id: "2", label: "Uptime", value: "99.97%" },
  { id: "3", label: "Managers", value: "0" },
];

export const benefits = [
  {
    id: "0",
    title: "Lead intake & enrichment",
    text: "Inbound prospects are researched, scored, and routed by agents before a human reads the email.",
    backgroundUrl: "/images/benefits/card-1.svg",
    iconUrl: "/images/benefits/icon-1.svg",
    imageUrl: "/images/benefits/image-2.webp",
    light: true,
  },
  {
    id: "1",
    title: "Content engine",
    text: "Briefs become drafts, edits, and scheduled posts through a pipeline that's reviewed, not hand-cranked.",
    backgroundUrl: "/images/benefits/card-2.svg",
    iconUrl: "/images/benefits/icon-2.svg",
    imageUrl: "/images/benefits/image-2.webp",
  },
  {
    id: "2",
    title: "Code review & shipping",
    text: "Agents triage issues, open pull requests, and babysit CI to green. Humans approve the merge.",
    backgroundUrl: "/images/benefits/card-3.svg",
    iconUrl: "/images/benefits/icon-3.svg",
    imageUrl: "/images/benefits/image-2.webp",
  },
  {
    id: "3",
    title: "Reporting & analytics",
    text: "Metrics are collected, summarized, and narrated into weekly updates nobody has to assemble by hand.",
    backgroundUrl: "/images/benefits/card-4.svg",
    iconUrl: "/images/benefits/icon-4.svg",
    imageUrl: "/images/benefits/image-2.webp",
    light: true,
  },
  {
    id: "4",
    title: "Back-office ops",
    text: "Invoices, contracts, and bookkeeping run as supervised automations with a paper trail.",
    backgroundUrl: "/images/benefits/card-5.svg",
    iconUrl: "/images/benefits/icon-1.svg",
    imageUrl: "/images/benefits/image-2.webp",
  },
  {
    id: "5",
    title: "QA & monitoring",
    text: "Synthetic checks, error triage, and incident summaries around the clock — the farm never sleeps.",
    backgroundUrl: "/images/benefits/card-6.svg",
    iconUrl: "/images/benefits/icon-2.svg",
    imageUrl: "/images/benefits/image-2.webp",
  },
];

export const collaboration = {
  text: "We plug agents into the tools teams already use. The same automations that run Rarebit run our client work — no new platform to adopt.",
  content: [
    {
      id: "0",
      title: "Agent-first delivery",
      text: "Every engagement starts by mapping which workflows an agent can own end-to-end — and which need a human in the loop.",
    },
    {
      id: "1",
      title: "Human-in-the-loop by design",
    },
    {
      id: "2",
      title: "Your tools, not new ones",
    },
  ],
  apps: [
    { id: "0", title: "Figma", icon: "/images/collaboration/figma.png", width: 26, height: 36 },
    { id: "1", title: "Notion", icon: "/images/collaboration/notion.png", width: 34, height: 36 },
    { id: "2", title: "Discord", icon: "/images/collaboration/discord.png", width: 36, height: 28 },
    { id: "3", title: "Slack", icon: "/images/collaboration/slack.png", width: 34, height: 35 },
    { id: "4", title: "Photoshop", icon: "/images/collaboration/photoshop.png", width: 34, height: 34 },
    { id: "5", title: "Protopie", icon: "/images/collaboration/protopie.png", width: 34, height: 34 },
    { id: "6", title: "Framer", icon: "/images/collaboration/framer.png", width: 26, height: 34 },
    { id: "7", title: "Raindrop", icon: "/images/collaboration/raindrop.png", width: 38, height: 32 },
  ],
};

export const roadmap = [
  {
    id: "0",
    title: "Agent fleet orchestration",
    text: "Specialized agents on every queue — research, code, content, ops — coordinated from a single control plane.",
    date: "Live now",
    status: "done",
    imageUrl: "/images/roadmap/image-1.webp",
    colorful: true,
  },
  {
    id: "1",
    title: "Client-facing dashboards",
    text: "Watch your automations work in real time: live operations feed, throughput, and what shipped this week.",
    date: "In the works",
    status: "progress",
    imageUrl: "/images/roadmap/image-2.webp",
  },
  {
    id: "2",
    title: "Self-healing pipelines",
    text: "Automations that detect their own failures, retry with context, and summarize the incident when they can't.",
    date: "In the works",
    status: "progress",
    imageUrl: "/images/roadmap/image-3.webp",
  },
  {
    id: "3",
    title: "Open-source primitives",
    text: "The auth, audit, ledger, and circuit-breaker building blocks we run on are open source — use them.",
    date: "Live now",
    status: "done",
    imageUrl: "/images/roadmap/image-4.webp",
  },
];
