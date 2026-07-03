// A minimal agent using the Leash SDK to make a policy-governed payment.
// Run the app first (`npm run web`), then: `npx tsx examples/agent.mts`
import { Leash } from "../src/sdk/leash.js";

const leash = new Leash(process.env.LEASH_URL ?? "http://localhost:8080");

const result = await leash.pay({
  query: "compare AI coding tools 2026",
  funding: "wallet", // or "credit" — the policy engine governs either
  asset: "AUTO", // pay with what the wallet holds, else XRP
  minUsdCents: 25, // auto-pay ≤ $0.25
  maxUsdCents: 50, // block > $0.50 (in between → human approval)
  liveMoney: true, // real testnet settlement
  onEvent: (e) => {
    if (e.type === "policy_decision") console.log("  policy:", (e.decision as { kind: string }).kind);
    else if (e.type === "settled") console.log(`  settled: $${((e.amountUsdCents as number) / 100).toFixed(2)} ${e.asset} → ${e.hash}`);
    else if (e.type === "approval_request") console.log("  ⏸ awaiting human approval (resolve in the Leash UI)");
  },
});

console.log("\nok:", result.ok);
console.log("payments:", result.payments.length);
console.log("results:", result.results.length, "items");
if (result.summary) console.log("answer:", result.summary);
if (result.error) console.log("error:", result.error);
