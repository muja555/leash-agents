import { estimateCents } from "../catalog.js";
import type { AiResult, ProviderCompleteArgs } from "../types.js";

/** OpenRouter gateway — one key (sk-or-…) routes to any model by its full id. */
export async function complete({ modelId, prompt, apiKey, pricing }: ProviderCompleteArgs): Promise<AiResult> {
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://leash.local",
      "X-Title": "Leash",
    },
    body: JSON.stringify({ model: modelId, messages: [{ role: "user", content: prompt }] }),
  });
  if (!resp.ok) throw new Error(`openrouter ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = (await resp.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  };
  const inputTokens = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;
  const costUsdCents =
    data.usage?.cost != null ? Math.ceil(data.usage.cost * 100) : estimateCents(pricing, inputTokens, outputTokens);
  return { text: data.choices?.[0]?.message?.content ?? "", model: modelId, usage: { inputTokens, outputTokens, costUsdCents } };
}
