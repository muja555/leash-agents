/**
 * AI model gateway — one integration, many models ("AI tokens" users spend).
 * The agent's reasoning step (M3) calls complete(); for now the agent is
 * deterministic and only the model catalog is consumed (by the UI dropdown).
 */
export interface AiModel {
  id: string; // OpenRouter model id, e.g. "anthropic/claude-haiku-4.5"
  label: string; // human label, e.g. "Claude Haiku 4.5"
  provider: string; // "anthropic" | "openai" | "google" | "x-ai" | "meta"
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

// ---------------------------------------------------------------------------
// Tool-calling chat — the model can PROPOSE actions (e.g. a payment) as
// structured tool calls. The runtime executes them through the policy
// pipeline; the model never signs or settles anything itself.
// ---------------------------------------------------------------------------

export type ChatRole = "system" | "user" | "assistant" | "tool";

/** A tool the model may call. `parameters` is a JSON Schema object. */
export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A tool call proposed by the model. `arguments` is the RAW JSON string —
 * the runtime must parse + validate it before acting (never trust it). */
export interface AiToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Present on assistant messages that proposed tool calls. */
  toolCalls?: AiToolCall[];
  /** Present on tool messages: which call this result answers. */
  toolCallId?: string;
}

export interface ChatArgs {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  /** BYOK fallback: per-request key when credits are off. */
  apiKey?: string;
}

export interface ChatResult {
  text: string;
  /** Empty array = the model answered directly (no action proposed). */
  toolCalls: AiToolCall[];
  model: string;
  usage: AiUsage;
  finishReason?: string;
}

export interface AiGateway {
  readonly id: string; // "openrouter"
  readonly enabled: boolean; // true once a gateway key is configured
  listModels(): AiModel[];
  complete(args: CompleteArgs): Promise<AiResult>;
  /** Multi-turn chat with tool definitions; returns text and/or tool calls. */
  chat(args: ChatArgs): Promise<ChatResult>;
}
