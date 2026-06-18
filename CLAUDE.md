# Leash — Agentic Payments on XRPL (proof-of-skill demo)

## What this is
A **control-tower** for AI agents that **pay per use** via XRPL settlement: a human delegates a **task + budget** to an agent, watches every payment live, approves anything over a threshold, and can hit a kill switch. The demo task is a **research agent**.

**v1 frontend is a Telegram bot.** A native mobile app (RN + Expo) and/or a web companion may come later once the loop has traction — they are *deferred, not killed*. The loop itself (agent → policy → on-chain payment → unlocked resource → human in control) is identical across frontends; only the shell changes.

This build is a **proof-of-skill demo first**, not a startup on day one. Its job is to prove the full loop end to end and double as an XRPL Grants application and the seed of a later product.

## Reference files (in this same folder)
- `leash_app_spec.html` — **canonical visual spec**. Six-screen mental model, button-color semantics (**red** = halt / deny / block, **green** = launch / allow, **gold** = money / budget, **blue** = navigate), payment-loop sequence. Read on demand for layout intent — the Telegram bot maps every interaction to one of these screen behaviors.
- `leash_user_journey.html` — **wireframes + screen-connection map**, with **M1/M2/M3/M4 badges** on every action showing when each interaction becomes real.
- `leash_telegram_demo.html` — **bot usage demo**: setup steps (BotFather → token → `/start`), styled mockup of the full chat conversation from `/task` to ✓ tx settled, what to verify on the explorer.
- `README.md` — repo quickstart for M1 and the bot.

## Decisions already made — do NOT re-litigate
- **XRPL is plumbing, not the bet.** The transferable skill is agentic payments / on-chain AI; the chain is a tool. **Testnet only** in this repo.
- **Rejected directions** (settled — don't propose these): a payments **SDK / rails / infra layer** (Stripe, Mastercard, Google own it); a **horizontal consumer spending-agent** app (Robinhood, Stripe Link, ChatGPT own it).
- **The defensible layer** is the application + human-oversight UX. **The policy engine — control over autonomy — is THE differentiator.** Invest there; never stub it.
- **Settlement:** XRPL testnet. M1 ships **direct-XRPL** (agent signs Payment with a memo nonce, merchant verifies on the ledger) because no hosted testnet x402 facilitator exists as of Jun 2026. **M2/M3 swap in `x402-xrpl`** if/when a testnet facilitator appears. The wire format is the outer skin; the loop's anatomy doesn't depend on it.
- **v1 frontend: Telegram bot.** Native mobile (RN + Expo) and a web companion are **deferred** — possibly revisited after Telegram traction. Reasoning: lower budget, faster to ship, audience already on Telegram, control-tower UX is fundamentally conversational.
- **AI cost model: BYOK only for v1.** User pastes a scoped + capped Anthropic API key in onboarding; Leash stores it encrypted at rest. Funded-wallet model (Leash brokers XRP → Anthropic) is the right long-term answer but requires capital + billing relationships we don't have.
- **Custody (demo):** backend custodies the agent wallet seed (encrypted at rest); the **policy engine gates signing**. Production would use scoped / smart-account permissions and rotation — state this openly.
- **Build priority:** thin slice first, polish last. M1 already proved the loop.

## Stack (locked for v1)
- **Frontend (v1):** Telegram bot via `telegraf` (Node + TS). Polling mode for local dev; webhook in production. Per-user state in memory for M2; persistent in M3.
- **Frontend (deferred):** React Native + Expo (mobile) and/or a web companion. Same backend, different shell.
- **Backend:** Node.js + TypeScript · Express (M1; Fastify later if needed) · in-memory state for the demo; Supabase / Postgres when persistence becomes load-bearing.
- **AI:** Anthropic Claude via tool use (BYOK). Haiku 4.5 by default; Sonnet/Opus only when complexity demands. Aggressive prompt caching.
- **XRPL:** `xrpl.js` · testnet faucet · public testnet explorer for proof. Direct-XRPL in M1; `x402-xrpl` middleware swap-in when a testnet facilitator exists.

## Milestones (build in this order)
1. **M1 — thin slice (DONE 2026-06-17):** agent makes ONE real XRPL testnet payment via the policy engine; logged with amount/service/hash/ledger; tx opens in the public explorer.
2. **M2 — Telegram bot v1:** `@LeashBot` exposes the loop via chat. Commands: `/start`, `/task <query>`, `/budget`, `/halt`, `/forget`. Streams the agent's events as messages. Inline buttons for navigation. **Deterministic agent for the first cut**; Claude + BYOK enters at M3.
3. **M3 — Claude reasoning + Approve/Deny + working Kill Switch:** wire Claude (BYOK) for the agent's reasoning. Threshold-triggered payments emit an **Approve / Deny** inline-keyboard message; user taps to release or refuse the signature. `/halt` flips the policy engine's `halted` flag and refuses every signature from that moment.
4. **M4 — polish:** richer result presentation (cost breakdown, deliverable formatting), `/export`, demo video, README polish, open-source. This is the XRPL Grants application material.

## The policy engine (single most important module)
Every payment passes these gates, in order, **before any signature is produced**: (1) not halted → (2) service allowed / not denylisted → (3) per-tx cap → (4) daily cap → (5) total budget remaining → (6) below the manual-approval threshold, else ask the human. Keep it as one well-tested module that all payment paths route through.

Implementation: `src/policy/engine.ts` (the `evaluate()` function). All M1+ payments route through it. The Telegram bot's Approve/Deny inline-button flow IS gate 6 made tactile.

## Conventions & guardrails
- Default to TypeScript. Provide a `.env.example`; **never commit secrets** (wallet seeds, API keys, bot tokens) — env vars only.
- **Testnet only.** No mainnet keys, no real funds, anywhere in this repo.
- Keep the human-in-the-loop controls (Approve / Deny, Kill Switch) wired for real, not mocked — they are the product's point.
- For BYOK: never log API keys; encrypt at rest with a separate master key from env (`LEASH_KEY_ENC_SECRET`); offer a `/forget` command that wipes the user's stored key instantly.
- When unsure about XRPL specifics, consult the XRPL AI Starter Kit docs rather than guessing.

## Out of scope (for now)
Mainnet · multiple task types · production-grade custody · funded-wallet AI billing · the regional/MENA fintech idea (separate, slower track) · buying or holding XRP (that's speculation, not this project).

## Current progress (2026-06-18)

- **M1 — DONE.** Direct-XRPL thin slice. First settled testnet tx `4B85617C1C393E97A72A9BDD81D34F5C8B718397DAEEDD397A5FD0912EBCDE38` (ledger 18297486). Commit `a79daa0`. Proof: https://testnet.xrpl.org/transactions/4B85617C1C393E97A72A9BDD81D34F5C8B718397DAEEDD397A5FD0912EBCDE38
- **M2 — IN PROGRESS / SCAFFOLDED.** Telegram bot (`telegraf`) wired to the existing M1 backend via an event-stream refactor of the agent. Deterministic agent loop streams reasoning/payment events into the chat. Commands: `/start`, `/task`, `/budget`, `/halt`, `/forget`, `/explorer`. See `src/bot/`. Ready for first live test once a bot token is set in `.env`.
- **Next: M3.** Wire Claude with BYOK, threshold-triggered Approve/Deny via inline buttons, functional Kill Switch enforcement.
