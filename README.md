# Leash — Agentic Payments on XRPL

> Control-tower for AI agents that **pay per use** on XRPL testnet. You delegate a task + budget; the policy engine gates every payment; you watch each one settle live with a real explorer link.

> 📄 Specs in this repo: [`CLAUDE.md`](./CLAUDE.md) (canonical) · [`leash_app_spec.html`](./leash_app_spec.html) (visual) · [`leash_user_journey.html`](./leash_user_journey.html) (wireframes + flow) · [`leash_web_demo.html`](./leash_web_demo.html) (web app setup + walkthrough)

## Status

| Milestone | State | Proof |
|---|---|---|
| **M1** — direct-XRPL thin slice | ✅ DONE 2026-06-17 | [tx `4B85617C…BCDE38`](https://testnet.xrpl.org/transactions/4B85617C1C393E97A72A9BDD81D34F5C8B718397DAEEDD397A5FD0912EBCDE38) |
| **M2** — web app frontend (BYOK) | ✅ SHIPPING | `npm run web` → http://localhost:8080 |
| **M3** — Claude (BYOK) + Approve/Deny + per-user wallets | ⏳ next | — |
| **M4** — polish + demo video + open-source | ⏳ later | — |

## Quickstart — the web app

```bash
npm install
cp .env.example .env       # leave seeds blank on first run; they auto-fund
npm run web                # opens at http://localhost:8080
```

Open http://localhost:8080 in your browser:
1. Paste an Anthropic API key in the BYOK card (saved only in your browser's localStorage). It's *visible in the UX* for M3 but not yet used by the agent.
2. Type a query (default: `compare AI coding tools 2026`).
3. Click **▶ Launch Agent**.
4. Watch the live feed stream events: probe → policy → sign → ✅ TX SETTLED. Click **View on Explorer** to see the real testnet transaction.

A styled walkthrough of the full UX is in [`leash_web_demo.html`](./leash_web_demo.html).

## Quickstart — terminal demo (M1)

If you just want to fire one payment from the CLI:

```bash
npm run m1
```

End state:
```
✓ PAYMENT SETTLED ON XRPL TESTNET
  hash:    <64-hex>
  ledger:  <int>
  open:    https://testnet.xrpl.org/transactions/<hash>
```

## BYOK — security model

- Your Anthropic key lives in your **browser's `localStorage`** (key `leash.anthropic_key`).
- On task launch, the key is sent in the JSON body of `POST /api/task` over the SSE stream.
- The backend **uses the key for the duration of the task and forgets it when the stream closes** — no server-side persistence.
- You can wipe it with the **Forget** button anytime.
- **Recommended:** create a *new* key in the Anthropic Console with a $5–$20/mo cap; revoke from the console anytime. Worst case: the cap amount.

## The six policy gates (the differentiator)

Every payment passes these, in order, **before any signature is produced**:

1. Not halted (kill switch)
2. Service allowed (allowlist) / not denylisted
3. Per-tx cap
4. Daily cap
5. Total budget remaining
6. Below the manual-approval threshold — else ask the human (M3+)

Implementation: [`src/policy/engine.ts`](./src/policy/engine.ts). All payment paths route through `evaluate()`.

## Layout

```
src/
  config.ts              env loading
  xrpl/
    client.ts            connect, load-or-fund wallet
    pay.ts               sign + broadcast a Payment (with optional memo for the M1 nonce binding)
    explorer.ts          testnet explorer URL helpers
  policy/
    types.ts             Policy, PaymentRequest, PolicyDecision
    engine.ts            the six gates — every payment routes through this
  server/
    merchant.ts          Express — issues 402 with a nonce, verifies tx on ledger
  agent/
    events.ts            AgentEvent union + default console sink
    m1.ts                deterministic agent loop, takes an onEvent callback
  web/
    server.ts            Express + static + Server-Sent Events for the live feed
  log/
    payments.ts          JSON log at data/payments.json
  main.ts                terminal demo entry (`npm run m1`)
public/
  index.html             the M2 web app (vanilla HTML/CSS/JS, single file)
```

## Honest simplifications

- **Direct XRPL payment, not x402 wire** in M1+M2. t54's XRPL x402 facilitator is hosted mainnet-only as of Jun 2026; our spec is testnet-only. The merchant verifies the tx on the ledger directly. When a hosted testnet facilitator exists, the swap to `x402-xrpl` middleware is ~15 lines added, ~80 deleted.
- **Deterministic agent in M2.** Claude tool use enters at M3 with the BYOK key.
- **Shared agent wallet** for all visitors in M2. M3 generates a per-user wallet on first visit with a `/wallet` panel showing address + balance + testnet-faucet button.
- **Custodial wallet seed** held by the backend (encrypted at rest in production). Testnet only here.

## Why a web app first?

- Faster to ship than a mobile app (no native build, no store review).
- Anyone can open a URL — no Telegram account, no `BotFather`, no app install.
- BYOK fits naturally in `localStorage` — key never leaves the browser except per-task.
- Mobile (RN + Expo) and a Telegram bot are deferred. Same backend, different shells.

## Frontend history (transparency)

| Attempt | When | Status |
|---|---|---|
| RN + Expo native mobile | Initial plan | Replaced — too much build time on solo-dev budget |
| Telegram bot via `telegraf` | Scaffolded 2026-06-18 (commit `e1729dc`) | Replaced — user prefers a URL anyone can open |
| **Web app (vanilla HTML + Express + SSE)** | Current | Shipping |

The agent loop, policy engine, wallet helpers, and event-sink abstraction are unchanged across all three. Only the shell changed each time.
