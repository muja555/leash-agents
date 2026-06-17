# Leash — Agentic Payments on XRPL (proof-of-skill demo)

## What this is
A mobile **control-tower** app: a human delegates a **task + budget** to an AI agent that **pays per use** via x402 micropayments on **XRPL** (RLUSD / XRP), while the human watches every payment live, approves anything over a threshold, and can hit a kill switch. The demo task is a **research agent**.

This build is a **proof-of-skill demo first**, not a startup on day one. Its job is to prove the full loop end to end — *AI reasoning → real on-chain payment → unlocked resource → human in control* — and double as an XRPL Grants application and the seed of a later product.

## Reference files (in this same folder)
- @agentic_payments_xrpl_app_spec.md — **canonical build spec**. Concept, full stack, all six screens with per-button actions, the payment loop, and the policy engine. This is the source of truth for what to build.
- `leash_app_spec.html` — **the same spec rendered visually**. Read this file (with your file tools, on demand — do not assume it from memory) whenever you need the screen layout, the payment-loop sequence as a diagram, or the **button color-coding semantics**: red = halt / deny / block, green = launch / allow, gold = money / budget, blue = navigate. It encodes the same content as the `.md`; use it as the visual reference.

> If you place these files in a subfolder (e.g. `docs/`), update the paths above accordingly.

## Decisions already made — do NOT re-litigate
- **XRPL is plumbing, not the bet.** The transferable skill is agentic payments / on-chain AI; the chain is a tool. Don't over-architect around XRPL specifically. **Testnet only** in this repo.
- **Rejected directions** (settled — don't propose these): building a payments **SDK / rails / infra layer** (Stripe, Mastercard, Google own it); a **horizontal consumer spending-agent** app (Robinhood, Stripe Link, ChatGPT own it). We do **not** compete at the rails or horizontal layer.
- **The defensible layer** is the application + human-oversight UX, plus niches/markets incumbents won't serve. **The policy engine — control over autonomy — is THE differentiator.** Invest there; never stub it.
- **Settlement:** XRPL testnet, RLUSD / XRP, via **x402**. **Lean on the XRPL AI Starter Kit** (Claude Skills + MCP server) — do not hand-roll payment plumbing.
- **Custody (demo):** backend custodies the agent wallet seed (encrypted at rest); the **policy engine gates signing**. Production would use scoped / smart-account permissions and rotation — state this openly, don't pretend it's production-grade.
- **Build priority: the week-one thin slice comes first.** Proof and momentum come from one working payment, not from polish.

## Stack (locked for the demo)
- **Mobile:** React Native + Expo + TypeScript · Expo Router · Zustand + TanStack Query · WebSocket / Supabase Realtime · victory-native (budget ring / spend graph).
- **Backend:** Node.js + TypeScript · Fastify + WebSocket gateway · Supabase (Postgres) · deploy on Railway / Fly.io / Cloud Run.
- **AI:** Claude via the Anthropic API with tool use · XRPL AI Starter Kit (Skills + MCP).
- **XRPL:** `xrpl.js` · x402 flow · testnet + faucet · public testnet explorer for proof.
- Alt if preferred: Python + FastAPI + `xrpl-py` for the backend/agent.

## Milestones (build in this order)
1. **M1 — thin slice (week 1):** agent makes ONE real x402 payment on XRPL testnet; it's logged (amount, service, hash, ledger index); the tx hash opens in the public explorer. Nothing else matters until this works.
2. **M2 — control tower (week 2):** minimal mobile app — Dashboard + Delegate + Live Run. Set a budget and policy; watch a live run feed over WebSocket / Realtime.
3. **M3 — oversight (week 3):** one end-to-end research task with the policy engine enforcing caps and firing the **Approve / Deny** prompt; **Kill Switch** halts signing immediately.
4. **M4 — polish (week 4):** Result + cost breakdown, demo video, README, open-source. This is the XRPL Grants application material.

## The policy engine (single most important module)
Every payment passes these gates, in order, **before any signature is produced**: (1) not halted → (2) service allowed / not denylisted → (3) per-tx cap → (4) daily cap → (5) total budget remaining → (6) below the manual-approval threshold, else ask the human. Keep it as one well-tested module that all payment paths route through.

## Conventions & guardrails for Claude Code
- Default to TypeScript. Provide a `.env.example`; **never commit secrets** (wallet seeds, API keys) — env vars only.
- **Testnet only.** No mainnet keys, no real funds, anywhere in this repo.
- Keep the human-in-the-loop controls (Approve / Deny, Kill Switch) wired for real, not mocked — they are the product's point.
- Button naming and behavior must match the spec exactly; an action keeps the same name through the whole flow.
- When unsure about XRPL or x402 specifics, consult the XRPL AI Starter Kit docs rather than guessing.

## Out of scope (for now)
Mainnet / real money · multiple task types · production-grade custody · the regional/MENA fintech idea (a separate, slower, probably non-crypto track) · buying or holding XRP (that's speculation, not this project).