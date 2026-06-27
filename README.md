# Leash — Agentic Payments on XRPL

> Control-tower for AI agents that **pay per use** on XRPL testnet. You delegate a task + budget; the policy engine gates every payment; you watch each one settle live with a real explorer link.

> 📄 Specs in this repo: [`CLAUDE.md`](./CLAUDE.md) (canonical) · [`leash_app_spec.html`](./leash_app_spec.html) (visual) · [`leash_user_journey.html`](./leash_user_journey.html) (wireframes + flow) · [`leash_web_demo.html`](./leash_web_demo.html) (web app setup + walkthrough)

## Status

| Milestone | State | Proof |
|---|---|---|
| **M1** — direct-XRPL thin slice | ✅ DONE 2026-06-17 | [tx `4B85617C…BCDE38`](https://testnet.xrpl.org/transactions/4B85617C1C393E97A72A9BDD81D34F5C8B718397DAEEDD397A5FD0912EBCDE38) |
| **M2** — web app frontend | ✅ DONE | `npm run web` → http://localhost:8080 |
| **M3** — Approve/Deny + Kill + Wallet + multi-chain/AI scaffold | ✅ DONE | live Approve/Deny modal, server-side kill switch, `/wallet` panel |
| **M4** — polish + open-source + demo video | 🔵 in progress | README + MIT license done; demo video pending |

**Approach A (control plane over the rails)** is scaffolded so going live is config + one adapter: a chain-agnostic `PaymentAdapter` (XRPL live; Solana/Base/Ethereum stubs), an AI model **gateway** (OpenRouter — many models, one key), and **prepaid USD credits** (non-custodial). See [`leash_competitor_analysis.html`](./leash_competitor_analysis.html) for the positioning.

## Quickstart — the web app

```bash
npm install
cp .env.example .env       # leave seeds blank on first run; they auto-fund
npm run web                # opens at http://localhost:8080
```

Open http://localhost:8080 in your browser:
1. Pick **run mode** — **Agent** (Demo = deterministic / Live = real AI reasoning, needs a key) and **Money** (Demo = simulated settlement / Live = real on-chain testnet payment). The policy engine, approvals, and kill switch stay real in every mode. Then pick a **model** + **settlement chain**, and optionally paste an **OpenRouter key** (`sk-or-…` — one key covers every model; browser `localStorage` only).
2. Set the **policy band** — auto-pay ≤ min, block > max; in between needs your approval.
3. Type a query and click **▶ Launch Agent**.
4. Watch the live feed: probe → policy → sign → ✅ TX SETTLED (real explorer link).
5. If a payment falls in the approval band, an **Approve/Deny modal** appears — no signature is produced until you choose. Hit **🛑 KILL** any time to halt the policy engine mid-run. Fund the agent wallet from the **/wallet** panel's faucet button.

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
6. Below the manual-approval threshold — else **ask the human** (live Approve/Deny modal)

Implementation: [`src/policy/engine.ts`](./src/policy/engine.ts). All payment paths route through `evaluate()`. Gate 1 reads a server-side kill flag re-checked before every signature ([`src/web/control.ts`](./src/web/control.ts)); gate 6 pauses the run and awaits the UI's decision.

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
  chains/                multi-chain payment layer (Approach A)
    types.ts             PaymentAdapter interface (chain-agnostic)
    xrpl.ts              live XRPL adapter (reference implementation)
    stub.ts              scaffolded Solana/Base/Ethereum placeholders
    index.ts             registry + resolveChain
  ai/                    AI model gateway ("AI tokens")
    gateway.ts           OpenRouter-backed; model catalog + complete()
  credits/
    ledger.ts            prepaid USD-credit ledger (non-custodial billing)
  server/
    merchant.ts          Express — issues 402 with a nonce, verifies tx on ledger
  agent/
    events.ts            AgentEvent union + default console sink
    m1.ts                agent loop — adapter-driven, with approve/deny + halt
  web/
    server.ts            Express + static + SSE; task/decision/kill/wallet APIs
    control.ts           kill switch flag + pending-approval registry
  log/
    payments.ts          JSON log at data/payments.json
  main.ts                terminal demo entry (`npm run m1`)
public/
  index.html             the web app (vanilla HTML/CSS/JS, single file)
```

## Honest simplifications

- **Direct XRPL payment, not x402 wire.** No hosted testnet x402 facilitator exists as of mid-2026; the merchant verifies the tx on the ledger directly. The wire format is the outer skin — swapping to `x402-xrpl` later doesn't touch the loop's anatomy.
- **Deterministic agent.** The AI gateway (`src/ai/gateway.ts`) is wired for real (OpenRouter `complete()`), but the agent loop doesn't yet *reason* with it — that's the remaining M3 step. Catalog + credits + BYOK are ready.
- **Other chains are scaffolded stubs.** XRPL is the live reference adapter. Adding Solana/Base = implement one `src/chains/<id>.ts` (mirror `xrpl.ts`) + add it to `CHAINS_ENABLED`. The policy engine is chain-agnostic and unchanged.
- **Credits off by default → BYOK mode.** The in-memory ledger is a stub; back it with Postgres/Stripe to bill. On-chain merchant payments stay **non-custodial** (the user's own wallet) — the deliberate choice that avoids money-transmitter exposure.
- **In-memory run controls.** The kill flag + approval registry (`src/web/control.ts`) are single-process; multi-user would key them by session.

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

## HTTP API (web app)

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/task` | Run a task; streams `AgentEvent`s as SSE. Body: `{ query, model?, chain?, apiKey?, minDrops?, maxDrops? }` |
| `POST` | `/api/decision` | Resolve a pending approval: `{ approvalId, decision: "approve"\|"deny" }` |
| `GET/POST` | `/api/kill` | Read / set the server-side kill switch: `{ halted }` |
| `GET` | `/api/wallet?chain=` | Agent wallet address + balance |
| `POST` | `/api/faucet?chain=` | Top up the agent wallet from the testnet faucet |
| `GET` | `/api/policy` · `/api/chains` · `/api/models` · `/api/credits` | Config the UI renders |

## License

MIT — see [`LICENSE`](./LICENSE). The policy engine and the rest of this repo are open source; the human-oversight UX is the point, and it's meant to be read, forked, and built on.
