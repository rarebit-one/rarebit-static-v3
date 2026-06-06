// Rarebit MCP server — Streamable HTTP (JSON-RPC over POST), stateless.
//
// The front door for AI assistants (/connect documents the client setup).
// Three read tools serve canned content from this file; submit_inquiry PUTs a
// JSON document into the DO Spaces inquiry inbox via a minimal SigV4 signer
// (no SDK — the function deploys with zero dependencies).
//
// Env (set by .do/app.yaml on the functions component):
//   SPACES_KEY, SPACES_SECRET — Spaces access key pair (secret)
//   SPACES_BUCKET             — inquiry inbox bucket
//   SPACES_REGION             — e.g. sgp1

import { createHash, createHmac, randomUUID } from "node:crypto";

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "rarebit-mcp", version: "0.1.0" };

// ---------------------------------------------------------------------------
// Canned content
// ---------------------------------------------------------------------------

const HOW_WE_WORK = `# How Rarebit works

Rarebit One is an AI automation farm run from Singapore. Agents and automations
handle the workflows; humans direct, review, and ship. Small teams. Impossible
things.

## The model

- **Agent-first delivery.** Every engagement starts by mapping which workflows
  an agent can own end-to-end — and which need a human in the loop.
- **Human-in-the-loop by design.** Agents work every queue; a human signs off
  on what ships. Code is reviewed and merged by people.
- **Your tools, not new ones.** We plug agents into the tools teams already
  use (Slack, Notion, Figma, GitHub, ...) — no new platform to adopt.
- **We run on our own automations.** The same farm that runs Rarebit's
  delivery pipeline runs our client work.

## What we automate

- Lead intake & enrichment — inbound prospects researched, scored, and routed
  before a human reads the email.
- Content engines — briefs become drafts, edits, and scheduled posts through a
  reviewed pipeline.
- Code review & shipping — agents triage issues, open pull requests, and
  babysit CI to green; humans approve the merge.
- Reporting & analytics — metrics collected, summarized, and narrated into
  weekly updates.
- Back-office ops — invoices, contracts, and bookkeeping as supervised
  automations with a paper trail.
- QA & monitoring — synthetic checks, error triage, and incident summaries
  around the clock.

## The entity

RAREBIT ONE (UEN 53503079K), a Singapore-registered business.
60 Paya Lebar Road, #06-28, Paya Lebar Square, Singapore 409051.
Web: https://rarebit.one · GitHub: https://github.com/rarebit-one

## Next step

If the user wants to explore working together, call the intake_questionnaire
tool and walk them through it conversationally, then submit with
submit_inquiry.`;

const OPEN_SOURCE = `# Rarebit open source

The primitives the farm runs on, released as focused libraries.
All at https://github.com/rarebit-one/<repo>.

## Authentication & Identity (Ruby / Rails 8)
- **standard_id** — comprehensive authentication engine: OAuth 2.0/OIDC with
  PKCE, passwordless email & SMS OTP, dual web/API engines, STI sessions.
- **standard_id-google** / **standard_id-apple** — social sign-in as opt-in
  provider plugins.
- **standard_id-provider** — scaffolding for building StandardId provider
  plugins.
- **standard_singpass** — Singpass MyInfo (FAPI 2.0) client: PKCE, DPoP,
  private_key_jwt, ECDH-ES JWE decryption, 40+ field person-data parser.

## Reliability & Observability (Ruby / Rails)
- **standard_circuit** — circuit-breaker primitives on stoplight, with Stripe/
  AWS/Faraday/SMTP adapter bundles and Sentry/metrics subscribers.
- **standard_health** — drop-in /health/alive, /health/ready, and env-spec
  auditing for Rails 8.
- **standard_audit** — database-backed audit logging via Rails events, with
  GDPR anonymization and sensitive-key stripping.

## Data Patterns (Ruby / Rails)
- **standard_ledger** — immutable journal entries with declarative aggregate
  projections (inline, async, sql, matview, trigger) and deterministic replay.

## Beyond Ruby
- **ktor-armour** — Kotlin/Ktor hardening suite: core, retry, reporting.
- **luminality-ui** — the React design system behind the Luminality apps.`;

const QUESTIONNAIRE = {
  instructions:
    "Walk the user through these questions conversationally — one at a time, " +
    "in order, skipping any they have already answered. Keep their own wording " +
    "in the answers. When done, confirm a short summary with the user, then " +
    "call submit_inquiry with the collected answers.",
  questions: [
    {
      id: "workflow",
      question:
        "Which workflow or recurring task would you automate first, and what does it look like today?",
    },
    {
      id: "pain",
      question:
        "What makes it painful right now — volume, speed, errors, cost, or something else?",
    },
    {
      id: "tools",
      question:
        "What tools does that workflow currently run through (e.g. Slack, Notion, GitHub, a CRM, spreadsheets)?",
    },
    {
      id: "volume",
      question:
        "Roughly how often does it run — items per day or week?",
    },
    {
      id: "oversight",
      question:
        "Where must a human stay in the loop (approvals, sign-off, compliance)?",
    },
    {
      id: "timeline",
      question: "When would you want this running?",
    },
    {
      id: "team",
      question:
        "Who's on your side of this — a solo founder, an ops team, an engineering team?",
    },
    {
      id: "contact",
      question:
        "Finally: a name, an email we can reply to, and (optionally) your company.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "how_we_work",
    description:
      "How Rarebit's AI automation farm operates: the engagement model, human-in-the-loop principles, what gets automated, and the registered entity behind it.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "open_source",
    description:
      "Rarebit's open-source catalog: every library we publish (auth, reliability, data patterns, Kotlin, frontend) and what each is for.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "intake_questionnaire",
    description:
      "A short structured intake to scope what kind of automation help the user needs. Returns ordered questions plus instructions for walking the user through them; finish by calling submit_inquiry.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "submit_inquiry",
    description:
      "Submit a scoped inquiry to Rarebit. Call after walking the user through intake_questionnaire and confirming a summary with them. Rarebit replies by email.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The user's name" },
        email: { type: "string", description: "Reply-to email address" },
        company: { type: "string", description: "Company or project (optional)" },
        summary: {
          type: "string",
          description: "2-5 sentence summary of what they want automated, confirmed with the user",
        },
        answers: {
          type: "object",
          description:
            "Answers keyed by intake_questionnaire question id (workflow, pain, tools, volume, oversight, timeline, team)",
          additionalProperties: { type: "string" },
        },
      },
      required: ["name", "email", "summary"],
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------------------
// Spaces (S3) SigV4 PUT — no SDK
// ---------------------------------------------------------------------------

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();

async function putToSpaces(key, body) {
  const { SPACES_KEY, SPACES_SECRET, SPACES_BUCKET, SPACES_REGION } = process.env;
  if (!SPACES_KEY || !SPACES_SECRET || !SPACES_BUCKET || !SPACES_REGION) {
    throw new Error("inquiry inbox is not configured");
  }

  const host = `${SPACES_BUCKET}.${SPACES_REGION}.digitaloceanspaces.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const canonicalUri = `/${key}`;

  const canonicalHeaders =
    `content-type:application/json\nhost:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const scope = `${dateStamp}/${SPACES_REGION}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${SPACES_SECRET}`, dateStamp), SPACES_REGION), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  const response = await fetch(`https://${host}${canonicalUri}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${SPACES_KEY}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`inbox write failed (${response.status})`);
  }
}

// ---------------------------------------------------------------------------
// Tool dispatch
// ---------------------------------------------------------------------------

const text = (value) => ({ content: [{ type: "text", text: value }] });
const toolError = (message) => ({ content: [{ type: "text", text: message }], isError: true });

async function callTool(name, args) {
  switch (name) {
    case "how_we_work":
      return text(HOW_WE_WORK);
    case "open_source":
      return text(OPEN_SOURCE);
    case "intake_questionnaire":
      return text(JSON.stringify(QUESTIONNAIRE, null, 2));
    case "submit_inquiry": {
      const { name: who, email, company, summary, answers } = args ?? {};
      if (typeof who !== "string" || !who.trim()) return toolError("name is required");
      if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return toolError("a valid email is required");
      }
      if (typeof summary !== "string" || !summary.trim()) return toolError("summary is required");

      const id = `${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
      const record = JSON.stringify(
        {
          id,
          received_at: new Date().toISOString(),
          name: who.trim(),
          email: email.trim(),
          company: typeof company === "string" ? company.trim() : undefined,
          summary: summary.trim(),
          answers: answers && typeof answers === "object" ? answers : undefined,
          source: "mcp",
        },
        null,
        2
      );

      try {
        await putToSpaces(`inquiries/${id}.json`, record);
      } catch (error) {
        return toolError(
          `Could not record the inquiry (${error.message}). ` +
            "Please email hello@rarebit.one instead — include the summary you just confirmed."
        );
      }
      return text(
        `Inquiry ${id} received — thank you! We read every submission and will reply to ${email.trim()} ` +
          "within two working days."
      );
    }
    default:
      return toolError(`unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC / Streamable HTTP plumbing
// ---------------------------------------------------------------------------

const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function handleRpc(message) {
  const { id = null, method, params } = message ?? {};
  switch (method) {
    case "initialize": {
      const requested = params?.protocolVersion;
      const protocolVersion = PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : PROTOCOL_VERSIONS[0];
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Rarebit's front door. Use how_we_work and open_source to answer questions about " +
          "Rarebit; use intake_questionnaire + submit_inquiry when the user wants to start a conversation.",
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: TOOLS });
    case "tools/call": {
      const result = await callTool(params?.name, params?.arguments);
      return rpcResult(id, result);
    }
    default:
      if (typeof method === "string" && method.startsWith("notifications/")) return null;
      return rpcError(id, -32601, `method not found: ${method}`);
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

const respond = (statusCode, payload) => ({
  statusCode,
  headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  body: payload === undefined ? "" : JSON.stringify(payload),
});

export async function main(event) {
  const method = (event?.http?.method ?? "POST").toUpperCase();
  if (method === "OPTIONS") return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  if (method === "GET") {
    // No server-initiated stream — Streamable HTTP allows refusing the GET.
    return respond(405, { error: "method not allowed; POST JSON-RPC messages" });
  }
  if (method !== "POST") return respond(405, { error: "method not allowed" });

  let raw = event?.http?.body ?? "";
  if (event?.http?.isBase64Encoded) raw = Buffer.from(raw, "base64").toString("utf8");

  let message;
  try {
    message = JSON.parse(raw);
  } catch {
    return respond(400, rpcError(null, -32700, "parse error"));
  }
  if (Array.isArray(message)) {
    const replies = (await Promise.all(message.map(handleRpc))).filter(Boolean);
    return replies.length ? respond(200, replies) : { statusCode: 202, headers: CORS_HEADERS, body: "" };
  }

  const reply = await handleRpc(message);
  if (reply === null) return { statusCode: 202, headers: CORS_HEADERS, body: "" };
  return respond(200, reply);
}
