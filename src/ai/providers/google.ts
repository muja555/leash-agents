import { estimateCents } from "../catalog.js";
import type { AiResult, ProviderCompleteArgs } from "../types.js";

/** Native Google Gemini adapter — generateContent with an AIza… key. */
export async function complete({ modelId, prompt, apiKey, pricing }: ProviderCompleteArgs): Promise<AiResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!resp.ok) throw new Error(`generativelanguage.googleapis.com ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = (await resp.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
  return {
    text,
    model: modelId,
    usage: { inputTokens, outputTokens, costUsdCents: estimateCents(pricing, inputTokens, outputTokens) },
  };
}
