// Single LLM provider — the one place every pipeline's model call lives.
//
// The provider is OpenAI (chat-completions). Swapping providers is a one-file
// change: rewrite callLLM here and every call site follows. The model is the
// `OPENAI_MODEL` repo variable (default "gpt-4o" when unset); the credential is
// the `OPENAI_API_KEY` secret. Call sites pass only { system, prompt, maxTokens,
// json } — they never touch the wire format, headers, or response shape.

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

/** Boolean — is the OpenAI credential present in the environment? */
export function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * One chat-completions call. Returns the assistant message content as a string.
 *
 * @param {object} opts
 * @param {string} opts.system     - system prompt
 * @param {string} opts.prompt     - user prompt
 * @param {number} [opts.maxTokens=1024]
 * @param {boolean} [opts.json=false] - request strict JSON output
 * @returns {Promise<string>}
 */
export async function callLLM({ system, prompt, maxTokens = 1024, json = false }) {
  const res = await fetch(ENDPOINT, {
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
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API ${res.status} — ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message;

  if (message?.refusal) {
    throw new Error(`OpenAI refused the request: ${message.refusal}`);
  }

  const content = message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("OpenAI returned empty content");
  }

  return content;
}
