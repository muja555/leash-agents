import { config } from "../../config.js";
import { findModel } from "../catalog.js";
import type { AiResult, CompleteArgs } from "../types.js";
import * as openrouter from "./openrouter.js";

/**
 * BYOK is OpenRouter-only: every key (per-request or the configured
 * OPENROUTER_API_KEY) is an OpenRouter key, and every model is reached through
 * the gateway by its full id. One key covers all providers.
 */
export type RouteVia = "openrouter" | "error";
export interface RouteDecision {
  via: RouteVia;
  modelId?: string;
  key?: string;
  message?: string;
}

/** Pure routing decision (no I/O) — exported for testing. */
export function decideRoute(fullId: string, reqKey: string | undefined, orKey: string | undefined): RouteDecision {
  const key = reqKey ?? orKey;
  if (!key) {
    return { via: "error", message: "no AI key — paste an OpenRouter key (sk-or-…) or set OPENROUTER_API_KEY." };
  }
  return { via: "openrouter", modelId: fullId, key };
}

export async function route(args: CompleteArgs): Promise<AiResult> {
  const model = findModel(args.model);
  const d = decideRoute(args.model, args.apiKey, config.ai.openrouterKey);
  if (d.via === "error") throw new Error(d.message ?? "no route");
  return openrouter.complete({ modelId: d.modelId as string, prompt: args.prompt, apiKey: d.key as string, pricing: model });
}
