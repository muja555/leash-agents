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

// ---------------------------------------------------------------------------
// Client-signing mode (SKETCH — server half not wired yet)
//
// The default `pay()` above is server-signing: the Leash server holds the seed
// (`XRPL_AGENT_SEED`) and signs. That is non-custodial ONLY when you self-host.
// To stay non-custodial even against a Leash-HOSTED server, the key must never
// leave the caller. That means splitting the one call into two phases:
//
//   phase 1  POST /api/quote   → server runs the 6 policy gates + builds the
//                                UNSIGNED tx. No signature exists yet. Returns
//                                { decision, unsignedTx, nonce }. If the policy
//                                says deny/ask_human, we stop here — nothing signed.
//   (local)  signer.sign(tx)   → the SDK signs LOCALLY with a key the server
//                                never sees.
//   phase 2  POST /api/submit  → hand back { signedTxBlob, nonce }; the server
//                                submits, verifies on-ledger, unlocks the data.
//
// The server never holds the key; the policy engine still gates BEFORE any
// signature (phase 1). Kill switch / approval also live in phase 1, so a halt
// or deny means no unsigned tx is ever returned to sign.
// ---------------------------------------------------------------------------

/** A prepared but UNSIGNED payment the caller signs locally. Chain-shaped loosely. */
export interface UnsignedTx {
  chain: string; // "xrpl" | …
  /** The XRPL Payment (or other chain's tx) object, ready to sign. */
  tx: Record<string, unknown>;
  /** Echoed back in phase 2 so the server binds the signed blob to this quote. */
  nonce: string;
}

/** The caller's local signer — holds the key the server must never see. */
export interface LeashSigner {
  /** The funding address; the server gates against it but never holds its key. */
  address: string;
  /** Sign an unsigned tx locally; return the signed blob (XRPL: tx_blob). */
  sign(unsigned: UnsignedTx): Promise<{ signedTxBlob: string }>;
}

export class Leash {
  constructor(private readonly baseUrl = "http://localhost:8080") {}

  /**
   * Non-custodial two-phase pay: quote (policy gates, unsigned tx) → sign LOCALLY
   * → submit. The key stays in `signer`; the server never sees it.
   *
   * SKETCH: the reference client half is implemented, but `/api/quote` and
   * `/api/submit` do not exist server-side yet (today's server signs in one
   * shot via /api/task). Wiring those two endpoints is the non-custodial-hosted
   * milestone; until then this throws a clear error rather than pretend.
   */
  async payClientSigned(
    opts: Omit<LeashPayOptions, "funding"> & { signer: LeashSigner },
  ): Promise<LeashResult> {
    const { signer, onEvent, ...body } = opts;

    // --- phase 1: quote — policy runs, NOTHING is signed yet ---
    const quoteResp = await fetch(`${this.baseUrl}/api/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, fromAddress: signer.address }),
    });
    if (quoteResp.status === 404) {
      throw new Error(
        "client-signing not available: this Leash server has no /api/quote (server-signing only). " +
          "Self-host for non-custodial, or use leash.pay(). See SKILL.md → Custody.",
      );
    }
    if (!quoteResp.ok) throw new Error(`quote failed: HTTP ${quoteResp.status}`);
    const quote = (await quoteResp.json()) as {
      decision: { kind: "allow" | "deny" | "ask_human"; reason?: string };
      unsignedTx?: UnsignedTx;
      nonce: string;
    };
    onEvent?.({ type: "policy_decision", decision: quote.decision });

    // Gate held BEFORE any signature exists — deny/ask_human stop here.
    if (quote.decision.kind !== "allow" || !quote.unsignedTx) {
      return {
        ok: false,
        query: opts.query,
        results: [],
        payments: [],
        error: `policy ${quote.decision.kind}${quote.decision.reason ? `: ${quote.decision.reason}` : ""}`,
      };
    }

    // --- local: sign with a key the server never sees ---
    const { signedTxBlob } = await signer.sign(quote.unsignedTx);

    // --- phase 2: submit the signed blob; server verifies + unlocks ---
    const submitResp = await fetch(`${this.baseUrl}/api/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: opts.query, nonce: quote.nonce, signedTxBlob }),
    });
    if (!submitResp.ok) throw new Error(`submit failed: HTTP ${submitResp.status}`);
    const out = (await submitResp.json()) as {
      results?: string[];
      summary?: string;
      payment?: LeashPayment;
    };
    onEvent?.({ type: "settled", ...(out.payment ?? {}) });
    return {
      ok: true,
      query: opts.query,
      results: out.results ?? [],
      summary: out.summary,
      payments: out.payment ? [out.payment] : [],
    };
  }

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
