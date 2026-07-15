import type { PolicyDecision } from "../policy/types.js";

/**
 * Events emitted by the agent loop. Both the terminal main.ts and the
 * Telegram bot subscribe to these — same loop, different sinks. When M3
 * adds Claude reasoning, new event types ("thinking", "tool_use") slot
 * into this union without touching the loop call sites.
 */
export type AgentEvent =
  | { type: "started"; query: string }
  | { type: "probing"; url: string }
  | {
      type: "challenge";
      amountUsdCents: number;
      asset: string;
      destination: string;
      memo: string;
    }
  | { type: "policy_decision"; decision: PolicyDecision }
  | { type: "wallet_loaded"; address: string }
  | {
      type: "funding";
      source: "wallet" | "credit";
      availableUsdCents?: number;
      limitUsdCents?: number;
      usedUsdCents?: number;
    }
  | { type: "fee"; amountUsdCents: number; destination: string; bps: number }
  | {
      type: "signing";
      amountUsdCents: number;
      destination: string;
      kind?: "merchant" | "fee";
    }
  | {
      type: "settled";
      hash: string;
      ledgerIndex: number;
      explorer: string;
      kind?: "merchant" | "fee";
      amountUsdCents?: number;
      chain?: string;
      simulated?: boolean; // demo-money mode: no real on-chain tx
      asset?: string; // settlement asset: "XRP" | "USDC" | …
      settleAmount?: string; // amount actually paid in `asset`
      source?: "wallet" | "credit"; // funding source that covered the payment
    }
  | {
      type: "approval_request";
      approvalId: string;
      amountUsdCents: number;
      destination: string;
      reason: string;
      kind: "merchant" | "fee";
    }
  | { type: "approval_resolved"; decision: "approve" | "deny"; kind: "merchant" | "fee" }
  | { type: "halted"; reason: string }
  | {
      type: "spend_update";
      spentTotalUsdCents: number; // cumulative across runs (session)
      spentTodayUsdCents: number;
      totalBudgetUsdCents: number;
    }
  | { type: "thinking"; text: string }
  | { type: "synthesis"; text: string; model: string; costUsdCents: number }
  // --- tool-agent loop: the model PROPOSES an action; the runtime executes it
  // through the policy pipeline and reports the outcome back to the model. ---
  | {
      type: "tool_call";
      callId: string;
      name: string; // "pay_for_resource" | "get_budget" | …
      args: Record<string, unknown>; // validated args (never the raw model JSON)
    }
  | {
      type: "tool_result";
      callId: string;
      name: string;
      ok: boolean; // false = denied / invalid / failed — the model must adapt
      summary: string; // short human-readable outcome for the UI
    }
  | { type: "assistant_text"; text: string; step: number }
  | { type: "unlocked"; query: string; results: string[] }
  | {
      type: "complete";
      hash: string;
      ledgerIndex: number;
      explorer: string;
    }
  | { type: "error"; message: string };

export type EventSink = (e: AgentEvent) => void | Promise<void>;

export const noopSink: EventSink = () => {};

/**
 * Default sink — pretty-prints events for the terminal demo.
 * The Telegram bot uses its own sink that turns events into chat messages.
 */
export const consoleSink: EventSink = (e) => {
  switch (e.type) {
    case "started":
      console.log(`[agent] started · query: "${e.query}"`);
      break;
    case "probing":
      console.log(`[agent] probing ${e.url}`);
      break;
    case "challenge":
      console.log(
        `[agent] 402 challenge: ${e.amountUsdCents}¢ ${e.asset} → ${e.destination} (memo: ${e.memo})`,
      );
      break;
    case "policy_decision": {
      const reason = "reason" in e.decision ? ` — ${e.decision.reason}` : "";
      console.log(`[policy] decision: ${e.decision.kind}${reason}`);
      break;
    }
    case "wallet_loaded":
      console.log(`[agent] wallet: ${e.address}`);
      break;
    case "funding":
      console.log(
        `[agent] funding: ${e.source}${e.source === "credit" ? ` (avail ${e.availableUsdCents}¢ / limit ${e.limitUsdCents}¢)` : ""}`,
      );
      break;
    case "fee":
      console.log(
        `[agent] platform fee ${e.bps / 100}%: ${e.amountUsdCents}¢ → ${e.destination}`,
      );
      break;
    case "approval_request":
      console.log(`[policy] awaiting human approval: ${e.amountUsdCents}¢ → ${e.destination}`);
      break;
    case "approval_resolved":
      console.log(`[policy] human ${e.decision === "approve" ? "approved" : "denied"} the ${e.kind} payment`);
      break;
    case "halted":
      console.log(`[agent] HALTED — ${e.reason}`);
      break;
    case "thinking":
      console.log(`[agent] thinking: ${e.text}`);
      break;
    case "synthesis":
      console.log(`[agent] ${e.model} synthesis (${e.costUsdCents}¢):\n${e.text}`);
      break;
    case "tool_call":
      console.log(`[agent] model proposes ${e.name}(${JSON.stringify(e.args)})`);
      break;
    case "tool_result":
      console.log(`[agent] ${e.name} → ${e.ok ? "ok" : "FAILED"}: ${e.summary}`);
      break;
    case "assistant_text":
      if (e.text) console.log(`[agent] (step ${e.step}) ${e.text}`);
      break;
    case "signing":
      console.log(`[agent] signing + broadcasting Payment…`);
      break;
    case "settled":
      console.log(`[agent] tx settled: ${e.hash} (ledger ${e.ledgerIndex})`);
      break;
    case "unlocked":
      console.log(`[agent] unlocked: ${e.results.length} results for "${e.query}"`);
      break;
    case "complete":
      console.log("\n" + "─".repeat(64));
      console.log("✓ PAYMENT SETTLED ON XRPL TESTNET");
      console.log(`  hash:    ${e.hash}`);
      console.log(`  ledger:  ${e.ledgerIndex}`);
      console.log(`  open:    ${e.explorer}`);
      console.log("─".repeat(64) + "\n");
      break;
    case "error":
      console.error(`✗ ${e.message}`);
      break;
  }
};
