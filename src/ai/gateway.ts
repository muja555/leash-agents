import { config } from "../config.js";
import type { AiGateway, AiModel, CompleteArgs, AiResult } from "./types.js";

/**
 * The catalog of models Leash offers. These are OpenRouter-style ids so the
 * gateway is a single integration across providers. Prices are indicative — the
 * real per-call cost comes back from the gateway in M3; these drive UI + credit
 * estimates today. Update freely; nothing else depends on the exact numbers.
 */
export const MODEL_CATALOG: AiModel[] = [
  { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", provider: "anthropic", inUsdPerMTok: 1, outUsdPerMTok: 5 },
  { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6", provider: "anthropic", inUsdPerMTok: 3, outUsdPerMTok: 15 },
  { id: "openai/gpt-5-mini", label: "GPT-5 mini", provider: "openai", inUsdPerMTok: 1, outUsdPerMTok: 4 },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google", inUsdPerMTok: 1, outUsdPerMTok: 3 },
  { id: "x-ai/grok-4-fast", label: "Grok 4 Fast", provider: "x-ai", inUsdPerMTok: 2, outUsdPerMTok: 8 },
  { id: "meta/llama-4-maverick", label: "Llama 4 Maverick", provider: "meta", inUsdPerMTok: 0.5, outUsdPerMTok: 1.5 },
];

/**
 * OpenRouter-backed gateway. `enabled` flips on once a key exists. complete()
 * is intentionally a stub until M3 — the agent doesn't reason yet — but the
 * wiring (catalog, key, markup, cost shape) is all here so M3 is a fill-in.
 */
export class OpenRouterGateway implements AiGateway {
  readonly id = "openrouter";
  readonly enabled = Boolean(config.ai.openrouterKey);

  listModels(): AiModel[] {
    return MODEL_CATALOG;
  }

  async complete(args: CompleteArgs): Promise<AiResult> {
    const key = args.apiKey ?? config.ai.openrouterKey;
    if (!key) {
      throw new Error("no AI key — set OPENROUTER_API_KEY or pass a BYOK key in the request.");
    }
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://leash.local",
        "X-Title": "Leash",
      },
      body: JSON.stringify({
        model: args.model,
        messages: [{ role: "user", content: args.prompt }],
      }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`gateway ${resp.status}: ${body.slice(0, 300)}`);
    }
    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    // OpenRouter returns `cost` in USD; fall back to a catalog estimate.
    const model = MODEL_CATALOG.find((m) => m.id === args.model);
    const estUsd =
      data.usage?.cost ??
      (model
        ? (inputTokens / 1e6) * model.inUsdPerMTok + (outputTokens / 1e6) * model.outUsdPerMTok
        : 0);
    return {
      text,
      model: args.model,
      usage: { inputTokens, outputTokens, costUsdCents: Math.ceil(estUsd * 100) },
    };
  }
}

let cached: AiGateway | null = null;
export function getGateway(): AiGateway {
  if (!cached) cached = new OpenRouterGateway();
  return cached;
}

/** Apply Leash's markup to a provider cost (in USD cents). */
export function withMarkup(costUsdCents: number): number {
  return Math.ceil(costUsdCents * (1 + config.ai.markupBps / 10_000));
}
