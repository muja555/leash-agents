/**
 * Leash SDK — a tiny client so an agent can make a POLICY-GOVERNED payment.
 * It wraps POST /api/task (Server-Sent Events) into one call that returns the
 * deliverable + the on-chain payments. Every payment still passes Leash's 6
 * policy gates, human approval, and kill switch server-side.
 */
export interface LeashPayOptions {
  query: string;
  funding?: "wallet" | "credit";
  asset?: string; // AUTO | XRP | USDC | USDT | RLUSD
  chain?: string;
  model?: string;
  apiKey?: string;
  minUsdCents?: number;
  maxUsdCents?: number;
  liveAgent?: boolean;
  liveMoney?: boolean;
  /** Stream every agent event (policy_decision, settled, approval_request, …). */
  onEvent?: (e: { type: string; [k: string]: unknown }) => void;
}

export interface LeashPayment {
  kind?: string;
  amountUsdCents?: number;
  asset?: string;
  settleAmount?: string;
  hash?: string;
  explorer?: string;
  source?: string;
  simulated?: boolean;
}

export interface LeashResult {
  ok: boolean;
  query: string;
  results: string[];
  summary?: string;
  payments: LeashPayment[];
  error?: string;
}

export class Leash {
  constructor(private readonly baseUrl = "http://localhost:8080") {}

  /** Ask Leash to govern-pay for a resource and return the result. */
  async pay(opts: LeashPayOptions): Promise<LeashResult> {
    const { onEvent, ...body } = opts;
    const resp = await fetch(`${this.baseUrl}/api/task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.body) throw new Error("no response body from Leash");

    const result: LeashResult = { ok: false, query: opts.query, results: [], payments: [] };
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        let ev = "message";
        let data = "";
        for (const line of block.split("\n")) {
          if (line.startsWith("event: ")) ev = line.slice(7).trim();
          else if (line.startsWith("data: ")) data += line.slice(6);
        }
        if (!data) continue;
        let p: { type?: string; [k: string]: unknown };
        try {
          p = JSON.parse(data);
        } catch {
          continue;
        }
        if (ev === "agent" && p.type) {
          onEvent?.(p as { type: string });
          if (p.type === "unlocked") result.results = (p.results as string[]) ?? [];
          else if (p.type === "synthesis") result.summary = p.text as string;
          else if (p.type === "settled") result.payments.push(p as LeashPayment);
          else if (p.type === "error") result.error = p.message as string;
        } else if (ev === "done") {
          result.ok = Boolean(p.ok);
          if (p.error) result.error = p.error as string;
        }
      }
    }
    return result;
  }
}
