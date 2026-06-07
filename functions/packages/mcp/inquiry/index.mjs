// Rarebit inquiry endpoint — plain HTTP POST for the /connect contact form.
//
// The form-shaped sibling of the MCP server's submit_inquiry tool: mobile
// users can't add MCP connectors (assistants only allow that on web/desktop),
// so the form posts here and lands in the same GitHub-issue inbox, labeled
// `inquiry`, next to the MCP-sourced leads.
//
// Env (set on the functions component; see .do/app.yaml):
//   GITHUB_TOKEN — fine-grained PAT, Issues read/write on GITHUB_REPO only (secret)
//   GITHUB_REPO  — owner/name receiving inquiry issues (e.g. rarebit-one/rarebit-ops)

import { randomUUID } from "node:crypto";

// Public-endpoint hygiene: cap field lengths and strip control characters so a
// hostile caller can't balloon an issue body or smuggle weird bytes into it.
const clean = (value, max) =>
  String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);

async function createInquiryIssue({ id, who, email, company, message }) {
  const { GITHUB_TOKEN, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    throw new Error("inquiry inbox is not configured");
  }

  const lines = [
    `**From:** ${who} <${email}>`,
    company ? `**Company:** ${company}` : null,
    `**Received:** ${new Date().toISOString()} via form (\`${id}\`)`,
    "",
    "## Message",
    "",
    message,
  ].filter((line) => line !== null);

  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "rarebit-inquiry",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: `Inquiry: ${who}${company ? ` (${company})` : ""}`,
      body: lines.join("\n"),
      labels: ["inquiry"],
    }),
  });
  if (!response.ok) {
    throw new Error(`inbox write failed (${response.status})`);
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const respond = (statusCode, payload) => ({
  statusCode,
  headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  body: JSON.stringify(payload),
});

export async function main(event) {
  const method = (event?.http?.method ?? "POST").toUpperCase();
  if (method === "OPTIONS") return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  if (method !== "POST") return respond(405, { error: "method not allowed" });

  let raw = event?.http?.body ?? "";
  if (event?.http?.isBase64Encoded) raw = Buffer.from(raw, "base64").toString("utf8");

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return respond(400, { error: "invalid JSON" });
  }

  const { name, email, company, message, website } = payload ?? {};

  // Honeypot: real users never fill the hidden "website" field. Pretend
  // success so bots don't learn anything.
  if (typeof website === "string" && website.trim() !== "") {
    return respond(200, { ok: true });
  }

  if (typeof name !== "string" || !name.trim()) {
    return respond(422, { error: "name is required" });
  }
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return respond(422, { error: "a valid email is required" });
  }
  if (typeof message !== "string" || !message.trim()) {
    return respond(422, { error: "message is required" });
  }

  const id = `${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
  try {
    await createInquiryIssue({
      id,
      who: clean(name, 200),
      email: clean(email, 200),
      company: typeof company === "string" && company.trim() ? clean(company, 200) : undefined,
      message: clean(message, 4000),
    });
  } catch {
    return respond(502, {
      error:
        "Could not record the inquiry. Please email hello@rarebit.one instead — include the message you just wrote.",
    });
  }

  return respond(200, { ok: true, id });
}
