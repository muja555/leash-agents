/**
 * AI model gateway — one integration, many models ("AI tokens" users spend).
 * The agent's reasoning step (M3) calls complete(); for now the agent is
 * deterministic and only the model catalog is consumed (by the UI dropdown).
 */
export interface AiModel {
  id: string; // gateway (OpenRouter) model id, e.g. "anthropic/claude-haiku-4.5"
  native: string; // provider-native id, e.g. "claude-haiku-4-5" (for direct BYOK)
  label: string; // human label, e.g. "Claude Haiku 4.5"
  provider: string; // "anthropic" | "openai" | "google" | "x-ai" | "meta"
  /** Only reachable via OpenRouter (no single native API), e.g. meta/llama. */
  openrouterOnly?: boolean;
  /** Rough $/1M tokens (input/output) — for credit pricing + display. */
  inUsdPerMTok: number;
  outUsdPerMTok: number;
}

/** Arguments a single provider adapter receives (router resolves the id + key). */
export interface ProviderCompleteArgs {
  modelId: string; // the id to send to THIS provider (native or full gateway id)
  prompt: string;
  apiKey: string;
  pricing?: AiModel; // catalog entry, for the cost estimate
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  costUsdCents: number; // provider cost (pre-markup)
}

export interface AiResult {
  text: string;
  model: string;
  usage: AiUsage;
}

export interface CompleteArgs {
  model: string;
  prompt: string;
  /** BYOK fallback: per-request key when credits are off. */
  apiKey?: string;
}

export interface AiGateway {
  readonly id: string; // "openrouter"
  readonly enabled: boolean; // true once a gateway key is configured
  listModels(): AiModel[];
  complete(args: CompleteArgs): Promise<AiResult>;
}
