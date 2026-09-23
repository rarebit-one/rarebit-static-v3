// Central LLM provider module — the ONE place every content pipeline's LLM call
// lives. The provider lives here: every farm script (field-notes, voice,
// freshness, farm-feed, notebook) calls `callLLM` instead of hand-rolling a
// fetch, so swapping providers is a one-file change.
//
// Provider: OpenAI chat-completions (POST /v1/chat/completions).
// Auth:     OPENAI_API_KEY secret.
// Model:    the OPENAI_MODEL repo variable for ALL calls (default "gpt-4o" when
//           unset) — one model var, no per-script overrides.

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

/** True when the OpenAI key is present — callers use this to graceful-no-op. */
export function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * One OpenAI chat-completions call. Returns the assistant message content as a
 * string. Throws on a non-OK response, a refusal, or empty content.
 *
 * @param {object}  opts
 * @param {string}  opts.system     system prompt
 * @param {string}  opts.prompt     user prompt
 * @param {number} [opts.maxTokens] max_completion_tokens (default 1024)
 * @param {boolean}[opts.json]      request a JSON object response
 * @param {number} [opts.temperature] sampling temperature. Omitted by default,
 *                                   so the API default applies (unchanged for
 *                                   existing callers); pass 0 for pipelines that
 *                                   must quote their input exactly. Best-effort:
 *                                   if OPENAI_MODEL is a model that rejects the
 *                                   parameter (reasoning models accept only
 *                                   their default), the call is retried once
 *                                   without it rather than failing the pipeline.
 * @returns {Promise<string>}
 */
export async function callLLM({ system, prompt, maxTokens = 1024, json = false, temperature }) {
  const post = (withTemperature) =>
    fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o",
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        max_completion_tokens: maxTokens,
        ...(json ? { response_format: { type: "json_object" } } : {}),
        ...(withTemperature ? { temperature } : {}),
      }),
    });

  const wantsTemperature = typeof temperature === "number";
  let res = await post(wantsTemperature);

  if (!res.ok && wantsTemperature && res.status === 400) {
    const body = await res.text();
    if (!/temperature/i.test(body)) {
      throw new Error(`OpenAI API ${res.status} — ${body.slice(0, 300)}`);
    }
    res = await post(false);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API ${res.status} — ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message;
  if (message?.refusal) {
    throw new Error(`OpenAI refusal — ${message.refusal}`);
  }
  const content = message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("OpenAI returned empty content");
  }
  return content;
}
