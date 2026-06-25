import Anthropic from "@anthropic-ai/sdk";
import { estimateCents } from "../catalog.js";
import type { AiResult, ProviderCompleteArgs } from "../types.js";

/**
 * Native Anthropic adapter — uses the official @anthropic-ai/sdk with the user's
 * own Anthropic key (sk-ant-…) and the provider-native model id (claude-haiku-4-5).
 */
export async function complete({ modelId, prompt, apiKey, pricing }: ProviderCompleteArgs): Promise<AiResult> {
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: modelId,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const inputTokens = msg.usage.input_tokens;
  const outputTokens = msg.usage.output_tokens;
  return {
    text,
    model: modelId,
    usage: { inputTokens, outputTokens, costUsdCents: estimateCents(pricing, inputTokens, outputTokens) },
  };
}
