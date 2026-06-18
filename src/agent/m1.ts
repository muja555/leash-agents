import { config } from "../config.js";
import { appendPayment } from "../log/payments.js";
import {
  evaluate,
  freshSpendState,
  recordSpend,
} from "../policy/engine.js";
import type { PaymentRequest, Policy } from "../policy/types.js";
import { loadOrFundWallet } from "../xrpl/client.js";
import { txExplorerUrl } from "../xrpl/explorer.js";
import { sendXrpPayment } from "../xrpl/pay.js";
import { noopSink, type EventSink } from "./events.js";

const SERVICE = "leash:research";

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

function buildPolicy(): Policy {
  return {
    totalBudgetDrops: config.policy.totalBudgetDrops,
    perTxCapDrops: config.policy.perTxCapDrops,
    dailyCapDrops: config.policy.dailyCapDrops,
    approvalThresholdDrops: config.policy.approvalThresholdDrops,
    allowlist: new Set([SERVICE]),
    denylist: new Set<string>(),
    halted: false,
  };
}

export interface RunM1Args {
  merchantPort: number;
  merchantPayTo: string;
  query?: string;
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
  const policy = buildPolicy();
  let spend = freshSpendState();

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

  // ----- 2. Policy engine — runs BEFORE any signature is produced -----
  const decision = evaluate(policy, spend, paymentRequest);
  await emit({ type: "policy_decision", decision });
  if (decision.kind === "deny") {
    throw new Error(`policy denied payment at gate ${decision.gate}: ${decision.reason}`);
  }
  if (decision.kind === "ask_human") {
    throw new Error(
      `policy requires human approval (${decision.reason}) — M1 cannot ask yet; raise POLICY_APPROVAL_THRESHOLD_DROPS or lower XRPL_PRICE_DROPS.`,
    );
  }

  // ----- 3. Load (or auto-fund) the agent wallet -----
  const agentWallet = await loadOrFundWallet(config.xrpl.agentSeed, "agent");
  await emit({ type: "wallet_loaded", address: agentWallet.classicAddress });

  // ----- 4. Sign + submit the Payment with the memo binding it to the 402 -----
  await emit({ type: "signing", amountDrops, destination: req402.payTo });
  const payment = await sendXrpPayment({
    wallet: agentWallet,
    destination: req402.payTo,
    amountDrops: req402.amountDrops,
    memo: req402.memo,
  });
  const explorer = txExplorerUrl(payment.hash);
  await emit({
    type: "settled",
    hash: payment.hash,
    ledgerIndex: payment.ledgerIndex,
    explorer,
  });

  // ----- 5. Retry the request with ?tx=<hash> — merchant verifies on ledger -----
  const retryUrl = `${url}&tx=${payment.hash}`;
  const retry = await fetch(retryUrl, { method: "GET", headers: { accept: "application/json" } });
  if (!retry.ok) {
    const body = await retry.text();
    throw new Error(`merchant rejected proof: HTTP ${retry.status} — ${body}`);
  }
  const data = (await retry.json()) as { query: string; results: string[] };
  await emit({ type: "unlocked", query: data.query, results: data.results });

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

  await emit({
    type: "complete",
    hash: payment.hash,
    ledgerIndex: payment.ledgerIndex,
    explorer,
  });

  return { hash: payment.hash, ledgerIndex: payment.ledgerIndex, explorer };
}
