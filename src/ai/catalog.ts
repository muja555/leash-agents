import type { AiModel } from "./types.js";

/**
 * The models Leash offers. `id` is the OpenRouter gateway id; `native` is the
 * provider-native id used when a user pastes that provider's own key. Anthropic
 * native ids are the exact API strings (no date suffixes). Prices are indicative
 * — used for UI + credit estimates; the gateway returns real cost when it can.
 */
export const MODEL_CATALOG: AiModel[] = [
  { id: "anthropic/claude-haiku-4.5", native: "claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "anthropic", inUsdPerMTok: 1, outUsdPerMTok: 5 },
  { id: "anthropic/claude-sonnet-4.6", native: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic", inUsdPerMTok: 3, outUsdPerMTok: 15 },
  { id: "openai/gpt-5-mini", native: "gpt-5-mini", label: "GPT-5 mini", provider: "openai", inUsdPerMTok: 1, outUsdPerMTok: 4 },
  { id: "google/gemini-2.5-flash", native: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google", inUsdPerMTok: 1, outUsdPerMTok: 3 },
  { id: "x-ai/grok-4-fast", native: "grok-4-fast", label: "Grok 4 Fast", provider: "x-ai", inUsdPerMTok: 2, outUsdPerMTok: 8 },
  { id: "meta/llama-4-maverick", native: "llama-4-maverick", label: "Llama 4 Maverick", provider: "meta", openrouterOnly: true, inUsdPerMTok: 0.5, outUsdPerMTok: 1.5 },
];

export function findModel(id: string): AiModel | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

/** Estimate provider cost in USD cents from token counts + catalog pricing. */
export function estimateCents(pricing: AiModel | undefined, inTok: number, outTok: number): number {
  if (!pricing) return 0;
  return Math.ceil(((inTok / 1e6) * pricing.inUsdPerMTok + (outTok / 1e6) * pricing.outUsdPerMTok) * 100);
}
