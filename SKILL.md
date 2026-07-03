---
name: leash
description: Governed payments for AI agents — pay per use on-chain, but only within the caps, approvals, and kill switch a human set. Non-custodial; works with the agent's own wallet or a credit line.
version: 0.1.0
---

# Leash — the control layer for agents that spend

Drop this in so your agent can **pay per use** (x402-style) for data/APIs/compute
— **safely**. An agent that can pay can also overspend, get prompt-injected, or
run away. Leash routes every payment through a policy engine **before any
signature is produced**, and keeps a human in the loop.

**A credit limit is a fuse. Leash is the steering wheel.** It sits on top of any
funding source — the agent's own wallet (non-custodial) *or* a credit line — and
governs the spend either way.

## What your agent gets

- **Policy gates (6, in order):** not halted → service allowed → per-tx cap →
  daily cap → total budget → below approval threshold, else **ask the human**.
- **Approve/Deny:** payments in the approval band pause for a one-click human OK.
- **Kill switch:** the operator can halt mid-run; the next signature is refused.
- **Non-custodial:** the agent pays from a wallet the user controls — Leash never
  holds the funds. (Or from a governed credit line.)
- **USD-denominated:** budgets/caps in USD; settles in XRP / USDC / USDT / RLUSD,
  auto-picked from the wallet or chosen explicitly.
- **Verifiable:** real on-chain settlement with an explorer link per payment.

## Integrate (the drop-in)

Point your agent at a Leash instance (self-host: `npm run web`, or a hosted URL).
When your agent needs a paid resource, it asks Leash to **govern-pay** for it.

```ts
import { Leash } from "leash/sdk"; // or ./src/sdk/leash.js when self-hosting

const leash = new Leash("http://localhost:8080");

const result = await leash.pay({
  query: "compare AI coding tools 2026", // the paid resource / task
  funding: "wallet",                     // "wallet" (own) | "credit" (credit line)
  asset: "AUTO",                         // AUTO | XRP | USDC | USDT | RLUSD
  minUsdCents: 25,                       // auto-pay ≤ $0.25
  maxUsdCents: 50,                       // block  > $0.50 (in between → human approval)
  liveMoney: true,                       // real on-chain settlement (else simulated)
  onEvent: (e) => console.log(e.type),   // stream: policy_decision, settled, …
});

console.log(result.summary, result.results, result.payments);
```

Every payment in `result.payments` carries `{ amountUsdCents, asset, settleAmount,
hash, explorer, source }`. If a payment needs human approval, the run pauses; the
operator resolves it in the Leash UI (or via `POST /api/decision`).

## Or call the API directly

`POST /api/task` — streams Server-Sent Events (`policy_decision`, `settled`,
`approval_request`, `unlocked`, `synthesis`, `complete`). Body: `{ query, funding,
asset, chain, minUsdCents, maxUsdCents, model, apiKey, liveAgent, liveMoney }`.
Read-only views: `/api/policy`, `/api/wallet`, `/api/assets`, `/api/funding`.
Controls: `/api/decision` (approve/deny), `/api/kill`.

## Guarantees

The policy engine is the point — it is never stubbed, and **no signature is
produced** unless the payment clears all six gates. See `src/policy/engine.ts`
(23 tests). This is the difference between a spend *ceiling* and *governance*.
