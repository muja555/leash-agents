# Leash — Agentic Payments on XRPL

> Control-tower for AI agents that **pay per use** on XRPL testnet. You delegate a task + budget; the policy engine gates every payment; you watch each one settle live with a real explorer link. Built as the seed of a later product and the XRPL Grants application.

> 📄 Specs in this repo: [`CLAUDE.md`](./CLAUDE.md) (canonical) · [`leash_app_spec.html`](./leash_app_spec.html) (visual) · [`leash_user_journey.html`](./leash_user_journey.html) (wireframes + flow) · [`leash_telegram_demo.html`](./leash_telegram_demo.html) (bot setup + chat walkthrough)

## Status

| Milestone | State | Proof |
|---|---|---|
| **M1** — direct-XRPL thin slice | ✅ DONE 2026-06-17 | [tx `4B85617C…BCDE38`](https://testnet.xrpl.org/transactions/4B85617C1C393E97A72A9BDD81D34F5C8B718397DAEEDD397A5FD0912EBCDE38) |
| **M2** — Telegram bot frontend | ✅ SCAFFOLD READY | `npm run bot` |
| **M3** — Claude (BYOK) + Approve/Deny + Kill Switch | ⏳ next | — |
| **M4** — polish + demo video + open-source | ⏳ later | — |

## Run M1 (terminal demo)

The original M1 — agent makes one real testnet payment, prints the explorer URL.

```bash
npm install
cp .env.example .env       # leave seeds blank on first run; they auto-fund
npm run m1
```

End state:
```
✓ PAYMENT SETTLED ON XRPL TESTNET
  hash:    <64-hex>
  ledger:  <int>
  open:    https://testnet.xrpl.org/transactions/<hash>
```

## Run M2 (the Telegram bot)

The same loop, exposed via chat.

1. **Get a bot token** — open Telegram → message `@BotFather` → `/newbot` → save the token.
2. **Set it in `.env`:** `TELEGRAM_BOT_TOKEN=1234567890:ABC…`
3. **Run the bot:**
   ```bash
   npm run bot
   ```
4. **Open Telegram, find your bot, send `/start`.** Then `/task lithium supply chain risks 2026`.

A styled walkthrough of the exact chat conversation is in [`leash_telegram_demo.html`](./leash_telegram_demo.html).

### Commands

| Command | What it does |
|---|---|
| `/start` | Welcome + current policy defaults |
| `/task <query>` | Kicks off the agent loop; streams every event into the chat; ends with an inline "View on Explorer" button |
| `/budget` | Shows policy (caps, threshold, halt state, merchant address) |
| `/halt` | Kill switch — toggle. Blocks new `/task` calls when halted |
| `/forget` | Wipes your per-user session state |
| `/explorer <hash>` | Returns the testnet explorer URL for any tx |

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
  bot/
    telegram.ts          telegraf bot — same loop, chat-driven
  log/
    payments.ts          JSON log at data/payments.json
  main.ts                bootstrap (terminal demo): start merchant, run agent once
```

## Honest simplifications

- **Direct XRPL payment, not x402 wire.** t54's XRPL x402 facilitator is hosted mainnet-only as of Jun 2026; our spec is testnet-only. The merchant verifies the tx on the ledger directly. When a hosted testnet facilitator exists, the swap to `x402-xrpl` middleware is ~15 lines added, ~80 deleted. **The policy engine, wallet helpers, and bot all live above the wire format.**
- **Deterministic agent in M2.** Claude tool use enters at M3 with BYOK.
- **BYOK for AI cost in v1.** User pastes a scoped + capped Anthropic key (M3+). The funded-wallet model (Leash brokers XRP → Anthropic) is the right v2 answer but needs capital we don't have yet.
- **Custodial wallet seed** held by the backend (encrypted at rest in production). Testnet only here.

## Why a Telegram bot first?

- Faster to ship (no app-store review, no auth, no UI build).
- The audience that watches XRPL talks and joins agent groups already lives in Telegram.
- Approve/Deny is fundamentally an inline button — the control-tower UX is conversational by nature.
- Mobile (RN + Expo) and a web companion are deferred, not killed. Same backend, different shells.
