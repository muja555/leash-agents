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
      amountDrops: number;
      asset: string;
      destination: string;
      memo: string;
    }
  | { type: "policy_decision"; decision: PolicyDecision }
  | { type: "wallet_loaded"; address: string }
  | { type: "signing"; amountDrops: number; destination: string }
  | {
      type: "settled";
      hash: string;
      ledgerIndex: number;
      explorer: string;
    }
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
        `[agent] 402 challenge: ${e.amountDrops} drops ${e.asset} → ${e.destination} (memo: ${e.memo})`,
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
