import { getGateway, withMarkup } from "../ai/gateway.js";
import { getAdapter, resolveChain, type ChainId } from "../chains/index.js";
import { config } from "../config.js";
import { getCredits } from "../credits/ledger.js";
import { appendPayment } from "../log/payments.js";
import {
  evaluate,
  freshSpendState,
  recordSpend,
} from "../policy/engine.js";
import type { PaymentRequest, Policy, SpendState } from "../policy/types.js";
import { noopSink, type EventSink } from "./events.js";

const SERVICE = "leash:research";
const FEE_SERVICE = "leash:fee"; // Leash's platform-fee payment

interface Required402 {
  error: string;
  service: string;
  network: string;
  asset: string;
  payTo: string;
  amountDrops: string;
  nonce: string;
  memo: string;
  instructions?: string;
}

/**
 * Per-run policy overrides the caller may supply (e.g. the web UI's min/max
 * inputs). Anything omitted falls back to the config defaults. These flow into
 * the real policy engine — they are not cosmetic.
 *   min = approvalThresholdDrops (at/below → auto-pay)
 *   max = perTxCapDrops          (above   → deny)
 */
export interface PolicyOverrides {
  approvalThresholdDrops?: number;
  perTxCapDrops?: number;
}

function buildPolicy(overrides?: PolicyOverrides): Policy {
  return {
    totalBudgetDrops: config.policy.totalBudgetDrops,
    perTxCapDrops: overrides?.perTxCapDrops ?? config.policy.perTxCapDrops,
    dailyCapDrops: config.policy.dailyCapDrops,
    approvalThresholdDrops:
      overrides?.approvalThresholdDrops ?? config.policy.approvalThresholdDrops,
    allowlist: new Set([SERVICE, FEE_SERVICE]),
    denylist: new Set<string>(),
    halted: false,
  };
}

export interface RunM1Args {
  merchantPort: number;
  merchantPayTo: string;
  query?: string;
  /** Settlement chain for this run; defaults to config.chains.default (xrpl). */
  chain?: ChainId;
  /** AI gateway model id for the reasoning step (M3). */
  model?: string;
  /** BYOK key for the reasoning step; else the configured gateway key is used. */
  aiKey?: string;
  /** Credits/user id to bill the AI cost against (in-memory ledger). */
  userId?: string;
  /** Per-run min/max overrides from the caller; applied in the policy engine. */
  policy?: PolicyOverrides;
  /** Agent mode: live = call the AI to reason; demo = deterministic. Default true. */
  liveAgent?: boolean;
  /** Money mode: live = real on-chain payment; demo = simulated settlement. Default true. */
  liveMoney?: boolean;
  /**
   * Gate 6 made tactile: when the policy returns `ask_human`, the loop pauses
   * and awaits this. Resolve "approve" to release the signature, "deny" to
   * refuse. Omitted (terminal mode) → ask_human is treated as a hard stop.
   */
  requestApproval?: (info: {
    amountDrops: number;
    destination: string;
    reason: string;
    kind: "merchant" | "fee";
  }) => Promise<"approve" | "deny">;
  /** Live kill-switch check; re-read before every gate + signature. */
  isHalted?: () => boolean;
  /**
   * Subscribes to the agent's progress events. Same loop serves the terminal
   * demo (consoleSink) and the Telegram bot (a sink that posts chat messages).
   */
  onEvent?: EventSink;
}

export async function runM1(
  args: RunM1Args,
): Promise<{ hash: string; ledgerIndex: number; explorer: string }> {
  const emit = args.onEvent ?? noopSink;
  const query = args.query ?? config.agent.query;
  const url = `http://127.0.0.1:${args.merchantPort}/research?q=${encodeURIComponent(query)}`;
  const policy = buildPolicy(args.policy);
  const chain = resolveChain(args.chain);
  const adapter = getAdapter(chain);
  const liveMoney = args.liveMoney !== false; // default true (real on-chain)
  const liveAgent = args.liveAgent !== false; // default true (real AI reasoning)
  let spend = freshSpendState();

  // Settle a payment: a real on-chain tx in live-money mode, or a marked
  // simulation in demo-money mode (policy gates still ran upstream either way).
  const settle = async (
    destination: string,
    amount: string,
    memo: string,
  ): Promise<{ hash: string; ledgerIndex: number; explorer: string; simulated: boolean }> => {
    if (liveMoney) {
      const r = await adapter.sendPayment({ destination, amount, memo });
      return { hash: r.hash, ledgerIndex: r.ledgerIndex, explorer: r.explorer, simulated: false };
    }
    const hash = `DEMO-${Date.now().toString(16)}-${Math.floor(Math.random() * 1e6).toString(16)}`;
    return { hash, ledgerIndex: 0, explorer: "", simulated: true };
  };

  // Re-read the kill switch and fold it into gate 1 before every evaluate/sign.
  const refreshHalt = (): void => {
    if (args.isHalted) policy.halted = args.isHalted();
  };
  const haltGuard = async (): Promise<void> => {
    if (args.isHalted?.()) {
      await emit({ type: "halted", reason: "kill switch active" });
      throw new Error("halted by kill switch");
    }
  };

  // Run one payment request through the policy engine, asking the human on
  // ask_human. Returns true to proceed, throws on deny/halt.
  const clearGate = async (
    req: PaymentRequest,
    spendForEval: SpendState,
    kind: "merchant" | "fee",
  ): Promise<void> => {
    refreshHalt();
    const decision = evaluate(policy, spendForEval, req);
    await emit({ type: "policy_decision", decision });
    if (decision.kind === "deny") {
      throw new Error(`policy denied ${kind} payment at gate ${decision.gate}: ${decision.reason}`);
    }
    if (decision.kind === "ask_human") {
      if (!args.requestApproval) {
        throw new Error(`policy requires human approval (${decision.reason}) — no approver attached`);
      }
      const verdict = await args.requestApproval({
        amountDrops: req.amountDrops,
        destination: req.destination,
        reason: decision.reason,
        kind,
      });
      await emit({ type: "approval_resolved", decision: verdict, kind });
      if (verdict === "deny") throw new Error(`${kind} payment denied by human`);
    }
    await haltGuard(); // a kill during the approval wait must still refuse
  };

  await emit({ type: "started", query });

  // ----- 1. Probe the merchant to get the REAL payment requirement -----
  await emit({ type: "probing", url });
  const probe = await fetch(url, { method: "GET", headers: { accept: "application/json" } });
  if (probe.status !== 402) {
    throw new Error(`expected 402 from merchant, got ${probe.status}`);
  }
  const req402 = (await probe.json()) as Required402;
  if (req402.network !== config.xrpl.network) {
    throw new Error(`network mismatch: merchant=${req402.network} agent=${config.xrpl.network}`);
  }
  if (req402.payTo !== args.merchantPayTo) {
    throw new Error(`merchant changed payTo mid-handshake: header=${args.merchantPayTo} body=${req402.payTo}`);
  }
  const amountDrops = Number(req402.amountDrops);
  if (!Number.isFinite(amountDrops) || amountDrops <= 0) {
    throw new Error(`merchant 402 amount is not a positive number: ${req402.amountDrops}`);
  }
  const paymentRequest: PaymentRequest = {
    service: req402.service,
    amountDrops,
    destination: req402.payTo,
    reason: `agent needs paid resource for query: "${query}"`,
  };
  await emit({
    type: "challenge",
    amountDrops,
    asset: req402.asset,
    destination: req402.payTo,
    memo: req402.memo,
  });

  // Leash's platform fee — a SEPARATE payment, on top of the merchant price,
  // sent to the configured fee wallet. Skipped entirely if no fee wallet is set.
  const feeWallet = config.fee.wallet;
  const feeBps = config.fee.bps;
  const feeDrops = feeWallet && feeBps > 0 ? Math.round((amountDrops * feeBps) / 10_000) : 0;
  const feeRequest: PaymentRequest | null =
    feeWallet && feeDrops > 0
      ? {
          service: FEE_SERVICE,
          amountDrops: feeDrops,
          destination: feeWallet,
          reason: `Leash platform fee (${feeBps / 100}%)`,
        }
      : null;

  // ----- 2. Policy engine — runs BEFORE any signature is produced -----
  // Merchant payment, then the fee (evaluated against spend projected AFTER the
  // merchant payment) — both pass the same engine; ask_human pauses for the UI.
  await clearGate(paymentRequest, spend, "merchant");
  if (feeRequest) {
    await clearGate(feeRequest, recordSpend(spend, paymentRequest), "fee");
  }

  // ----- 3. Load (or auto-fund) the agent wallet on the chosen chain -----
  if (liveMoney) {
    const { address } = await adapter.loadAgentWallet();
    await emit({ type: "wallet_loaded", address });
  } else {
    await emit({ type: "wallet_loaded", address: "(demo money — no on-chain wallet)" });
  }

  // ----- 4. Sign + submit the Payment with the memo binding it to the 402 -----
  await haltGuard();
  await emit({ type: "signing", amountDrops, destination: req402.payTo, kind: "merchant" });
  const payment = await settle(req402.payTo, req402.amountDrops, req402.memo);
  const explorer = payment.explorer;
  await emit({
    type: "settled",
    hash: payment.hash,
    ledgerIndex: payment.ledgerIndex,
    explorer,
    kind: "merchant",
    amountDrops,
    chain,
    simulated: payment.simulated,
  });

  // ----- 5. Unlock the data. Live: prove the tx on-ledger. Demo: skip proof. -----
  const retryUrl = liveMoney ? `${url}&tx=${payment.hash}` : `${url}&demo=1`;
  const retry = await fetch(retryUrl, { method: "GET", headers: { accept: "application/json" } });
  if (!retry.ok) {
    const body = await retry.text();
    throw new Error(`merchant rejected request: HTTP ${retry.status} — ${body}`);
  }
  const data = (await retry.json()) as { query: string; results: string[] };
  await emit({ type: "unlocked", query: data.query, results: data.results });

  // ----- 5b. Reason over the paid results (AI gateway) -----
  // Graceful: only runs when a key is available (BYOK or configured gateway).
  // Without one, the agent stays deterministic and the raw results stand.
  const gateway = getGateway();
  const haveAi = Boolean(args.aiKey) || gateway.enabled;
  if (liveAgent && !haveAi) {
    await emit({ type: "thinking", text: "live agent selected but no AI key — paste a key (or an sk-or- key) to enable reasoning." });
  }
  if (liveAgent && haveAi) {
    const model = args.model ?? config.ai.defaultModel;
    try {
      await emit({ type: "thinking", text: `reading ${data.results.length} paid sources with ${model}…` });
      const prompt =
        `User question: "${data.query}"\n\n` +
        `Paid research results:\n${data.results.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n\n` +
        `Write a concise, well-sourced answer in 3–5 sentences. Cite the result numbers you used.`;
      const ai = await gateway.complete({ model, prompt, apiKey: args.aiKey });
      const charge = withMarkup(ai.usage.costUsdCents);
      // No-op when credits are disabled (BYOK mode); deducts when enabled.
      await getCredits().debit(args.userId ?? "demo", charge, `ai:${model}`);
      await emit({ type: "synthesis", text: ai.text, model: ai.model, costUsdCents: charge });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await emit({ type: "thinking", text: `AI synthesis skipped — ${msg}` });
    }
  }

  // ----- 6. Record the spend + log the payment -----
  spend = recordSpend(spend, paymentRequest);
  await appendPayment({
    ts: new Date().toISOString(),
    service: paymentRequest.service,
    amountDrops: req402.amountDrops,
    hash: payment.hash,
    ledgerIndex: payment.ledgerIndex,
    explorer,
  });

  // ----- 7. Pay Leash's platform fee — separate on-chain tx, on top -----
  if (feeRequest) {
    await emit({
      type: "fee",
      amountDrops: feeRequest.amountDrops,
      destination: feeRequest.destination,
      bps: feeBps,
    });
    await haltGuard();
    await emit({
      type: "signing",
      amountDrops: feeRequest.amountDrops,
      destination: feeRequest.destination,
      kind: "fee",
    });
    const feePayment = await settle(
      feeRequest.destination,
      String(feeRequest.amountDrops),
      `leash-fee:${req402.nonce}`,
    );
    const feeExplorer = feePayment.explorer;
    await emit({
      type: "settled",
      hash: feePayment.hash,
      ledgerIndex: feePayment.ledgerIndex,
      explorer: feeExplorer,
      kind: "fee",
      amountDrops: feeRequest.amountDrops,
      chain,
      simulated: feePayment.simulated,
    });
    spend = recordSpend(spend, feeRequest);
    await appendPayment({
      ts: new Date().toISOString(),
      service: feeRequest.service,
      amountDrops: String(feeRequest.amountDrops),
      hash: feePayment.hash,
      ledgerIndex: feePayment.ledgerIndex,
      explorer: feeExplorer,
    });
  }

  await emit({
    type: "complete",
    hash: payment.hash,
    ledgerIndex: payment.ledgerIndex,
    explorer,
  });

  return { hash: payment.hash, ledgerIndex: payment.ledgerIndex, explorer };
}
