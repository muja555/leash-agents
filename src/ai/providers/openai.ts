import { estimateCents } from "../catalog.js";
import type { AiResult, ProviderCompleteArgs } from "../types.js";

/**
 * OpenAI-compatible adapter — serves both OpenAI (api.openai.com) and xAI/Grok
 * (api.x.ai), which share the /chat/completions shape. The router passes the
 * right base URL + native model id.
 */
export async function complete(
  { modelId, prompt, apiKey, pricing }: ProviderCompleteArgs,
  baseUrl: string,
): Promise<AiResult> {
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelId, messages: [{ role: "user", content: prompt }], max_tokens: 1024 }),
  });
  const host = baseUrl.replace(/^https?:\/\//, "").split("/")[0];
  if (!resp.ok) throw new Error(`${host} ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = (await resp.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const inputTokens = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    model: modelId,
    usage: { inputTokens, outputTokens, costUsdCents: estimateCents(pricing, inputTokens, outputTokens) },
  };
}
