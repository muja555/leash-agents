import { config } from "../config.js";
import { MODEL_CATALOG } from "./catalog.js";
import { route } from "./providers/router.js";
import type { AiGateway, AiModel, AiResult, CompleteArgs } from "./types.js";

export { MODEL_CATALOG } from "./catalog.js";

/**
 * Facade over the OpenRouter gateway. BYOK is OpenRouter-only: `complete()`
 * routes every model + key through OpenRouter (see providers/router.ts).
 * `enabled` reflects only the server-configured gateway key; per-request BYOK
 * keys are handled separately by the `haveAi` gate in the agent loop.
 */
export class OpenRouterGateway implements AiGateway {
  readonly id = "openrouter";
  readonly enabled = Boolean(config.ai.openrouterKey);

  listModels(): AiModel[] {
    return MODEL_CATALOG;
  }

  complete(args: CompleteArgs): Promise<AiResult> {
    return route(args);
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
