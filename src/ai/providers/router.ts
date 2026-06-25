import { config } from "../../config.js";
import { findModel } from "../catalog.js";
import type { AiModel, AiResult, CompleteArgs } from "../types.js";
import * as anthropic from "./anthropic.js";
import * as google from "./google.js";
import * as openai from "./openai.js";
import * as openrouter from "./openrouter.js";

const OPENAI_BASE = "https://api.openai.com/v1";
const XAI_BASE = "https://api.x.ai/v1";

export type RouteVia = "openrouter" | "anthropic" | "openai" | "xai" | "google" | "error";
export interface RouteDecision {
  via: RouteVia;
  modelId?: string; // id to send to the chosen provider
  key?: string;
  message?: string; // set when via === "error"
}

/**
 * Pure routing decision (no I/O) — exported for testing. An OpenRouter key
 * (sk-or-…), or no per-request key + a configured gateway key, → OpenRouter with
 * the full id. A native key → that provider's API with the native id. Models
 * with no native API (meta/llama) require OpenRouter.
 */
export function decideRoute(
  model: AiModel | undefined,
  fullId: string,
  reqKey: string | undefined,
  orKey: string | undefined,
): RouteDecision {
  const isOrKey = Boolean(reqKey && reqKey.startsWith("sk-or-"));
  if (isOrKey || (!reqKey && orKey)) {
    const key = reqKey ?? orKey;
    if (!key) return { via: "error", message: "no AI key configured." };
    return { via: "openrouter", modelId: fullId, key };
  }
  if (!reqKey) {
    return { via: "error", message: "no AI key — set OPENROUTER_API_KEY or paste a provider key." };
  }
  const nativeId = model?.native ?? fullId;
  switch (model?.provider) {
    case "anthropic":
      return { via: "anthropic", modelId: nativeId, key: reqKey };
    case "openai":
      return { via: "openai", modelId: nativeId, key: reqKey };
    case "x-ai":
      return { via: "xai", modelId: nativeId, key: reqKey };
    case "google":
      return { via: "google", modelId: nativeId, key: reqKey };
    default:
      if (orKey) return { via: "openrouter", modelId: fullId, key: orKey };
      return {
        via: "error",
        message: `model "${fullId}" has no native API for provider "${model?.provider}" — use an OpenRouter key (sk-or-…).`,
      };
  }
}

export async function route(args: CompleteArgs): Promise<AiResult> {
  const model = findModel(args.model);
  const d = decideRoute(model, args.model, args.apiKey, config.ai.openrouterKey);
  const base = { modelId: d.modelId as string, prompt: args.prompt, apiKey: d.key as string, pricing: model };
  switch (d.via) {
    case "openrouter":
      return openrouter.complete(base);
    case "anthropic":
      return anthropic.complete(base);
    case "openai":
      return openai.complete(base, OPENAI_BASE);
    case "xai":
      return openai.complete(base, XAI_BASE);
    case "google":
      return google.complete(base);
    default:
      throw new Error(d.message ?? "no route");
  }
}
