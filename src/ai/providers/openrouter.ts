import { estimateCents } from "../catalog.js";
import type {
  AiModel,
  AiResult,
  AiToolCall,
  AiUsage,
  ChatMessage,
  ChatResult,
  ProviderCompleteArgs,
  ToolDef,
} from "../types.js";

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const HEADERS = (apiKey: string): Record<string, string> => ({
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
  "HTTP-Referer": "https://leash.local",
  "X-Title": "Leash",
});

/** Raw OpenAI-format response shape (OpenRouter is OpenAI-compatible). */
interface RawResponse {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
    };
    finish_reason?: string;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
}

function usageOf(data: RawResponse, pricing: AiModel | undefined): AiUsage {
  const inputTokens = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;
  const costUsdCents =
    data.usage?.cost != null ? Math.ceil(data.usage.cost * 100) : estimateCents(pricing, inputTokens, outputTokens);
  return { inputTokens, outputTokens, costUsdCents };
}

async function post(apiKey: string, body: unknown): Promise<RawResponse> {
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: HEADERS(apiKey),
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`openrouter ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  return (await resp.json()) as RawResponse;
}

/** OpenRouter gateway — one key (sk-or-…) routes to any model by its full id. */
export async function complete({ modelId, prompt, apiKey, pricing }: ProviderCompleteArgs): Promise<AiResult> {
  const data = await post(apiKey, { model: modelId, messages: [{ role: "user", content: prompt }] });
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    model: modelId,
    usage: usageOf(data, pricing),
  };
}

/** Map our neutral ChatMessage to the OpenAI wire format. */
function toWire(m: ChatMessage): Record<string, unknown> {
  if (m.role === "assistant" && m.toolCalls?.length) {
    return {
      role: "assistant",
      content: m.content || null,
      tool_calls: m.toolCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: c.arguments },
      })),
    };
  }
  if (m.role === "tool") {
    return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
  }
  return { role: m.role, content: m.content };
}

export interface ProviderChatArgs {
  modelId: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  apiKey: string;
  pricing?: AiModel;
}

/**
 * Tool-calling chat. The model can answer OR propose tool calls; the caller
 * validates + executes them (through the policy pipeline) and loops.
 */
export async function chat({ modelId, messages, tools, apiKey, pricing }: ProviderChatArgs): Promise<ChatResult> {
  const body: Record<string, unknown> = {
    model: modelId,
    messages: messages.map(toWire),
  };
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = "auto";
  }
  const data = await post(apiKey, body);
  const msg = data.choices?.[0]?.message;
  const toolCalls: AiToolCall[] = (msg?.tool_calls ?? [])
    .map((c, i) => ({
      id: c.id ?? `call_${i}`,
      name: c.function?.name ?? "",
      arguments: c.function?.arguments ?? "{}",
    }))
    .filter((c) => c.name.length > 0);
  return {
    text: msg?.content ?? "",
    toolCalls,
    model: modelId,
    usage: usageOf(data, pricing),
    finishReason: data.choices?.[0]?.finish_reason,
  };
}
