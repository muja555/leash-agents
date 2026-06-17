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

export async function runM1(args: {
  merchantPort: number;
  merchantPayTo: string;
}): Promise<{ hash: string; ledgerIndex: number; explorer: string }> {
  const url = `http://127.0.0.1:${args.merchantPort}/research?q=${encodeURIComponent(config.agent.query)}`;
  const policy = buildPolicy();
  let spend = freshSpendState();

  // ----- 1. Probe the merchant to get the REAL payment requirement -----
  //         The policy engine must evaluate the actual on-the-wire amount.
  //         This is the spec's "before any signature is ever produced"
  //         guarantee, made literal.
  console.log(`[agent] probing ${url}`);
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
    reason: `agent needs paid resource for query: "${config.agent.query}"`,
  };
  console.log(
    `[agent] 402 challenge: ${amountDrops} drops ${req402.asset} → ${req402.payTo} (memo: ${req402.memo})`,
  );

  // ----- 2. Policy engine — runs BEFORE any signature is produced -----
  const decision = evaluate(policy, spend, paymentRequest);
  console.log(
    `[policy] decision: ${decision.kind}` +
      ("reason" in decision ? ` — ${decision.reason}` : ""),
  );
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
  console.log(`[agent] wallet: ${agentWallet.classicAddress}`);

  // ----- 4. Sign + submit the Payment with the memo binding it to the 402 -----
  console.log(`[agent] signing + broadcasting Payment…`);
  const payment = await sendXrpPayment({
    wallet: agentWallet,
    destination: req402.payTo,
    amountDrops: req402.amountDrops,
    memo: req402.memo,
  });
  console.log(`[agent] tx settled: ${payment.hash} (ledger ${payment.ledgerIndex})`);

  // ----- 5. Retry the request with ?tx=<hash> — merchant verifies on ledger -----
  const retryUrl = `${url}&tx=${payment.hash}`;
  console.log(`[agent] retrying with proof: ${retryUrl}`);
  const retry = await fetch(retryUrl, { method: "GET", headers: { accept: "application/json" } });
  if (!retry.ok) {
    const body = await retry.text();
    throw new Error(`merchant rejected proof: HTTP ${retry.status} — ${body}`);
  }
  const data = (await retry.json()) as { query: string; results: string[] };
  console.log(`[agent] unlocked: ${data.results.length} results for "${data.query}"`);

  // ----- 6. Record the spend + log the payment -----
  const explorer = txExplorerUrl(payment.hash);
  spend = recordSpend(spend, paymentRequest);
  await appendPayment({
    ts: new Date().toISOString(),
    service: paymentRequest.service,
    amountDrops: req402.amountDrops,
    hash: payment.hash,
    ledgerIndex: payment.ledgerIndex,
    explorer,
  });

  return { hash: payment.hash, ledgerIndex: payment.ledgerIndex, explorer };
}
