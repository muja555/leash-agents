# Leash — Agentic Payments on XRPL (proof-of-skill demo)

## What this is
A **control-tower** for AI agents that **pay per use** via XRPL settlement: a human delegates a **task + budget** to an agent, watches every payment live, approves anything over a threshold, and can hit a kill switch. The demo task is a **research agent**.

**v1 frontend is a web page (BYOK).** Native mobile (RN + Expo) and a Telegram bot are *both deferred but not killed* — they were prior plans, each replaced because: mobile = too much build time on this budget; Telegram bot = required users to be in Telegram and added a hosting/publishing step that web sidesteps. The loop (agent → policy → on-chain payment → unlocked resource → human in control) is identical across frontends; only the shell changes.

This build is a **proof-of-skill demo first**, not a startup on day one. Its job is to prove the full loop end to end and double as an XRPL Grants application and the seed of a later product.

## Reference files (in this same folder)
- `leash_app_spec.html` — **canonical visual spec**. Six-screen mental model, button-color semantics (**red** = halt / deny / block, **green** = launch / allow, **gold** = money / budget, **blue** = navigate), payment-loop sequence. Read on demand for layout intent — the web page maps each section to one of these screen behaviors (Dashboard, Delegate, Live Run, Result fold into a single page; Tx Detail + Budget/Policy are modals).
- `leash_user_journey.html` — **wireframes + screen-connection map**, with **M1/M2/M3/M4 badges** on every action showing when each interaction becomes real.
- `leash_web_demo.html` — **web app usage demo**: setup, BYOK security model, screenshots of the running page, what to verify on the explorer.
- `README.md` — repo quickstart for M1 (terminal) and M2 (web app).

## Decisions already made — do NOT re-litigate
- **XRPL is plumbing, not the bet.** The transferable skill is agentic payments / on-chain AI; the chain is a tool. **Testnet only** in this repo.
- **Rejected directions** (settled): a payments **SDK / rails / infra layer** (Stripe, Mastercard, Google own it); a **horizontal consumer spending-agent** app (Robinhood, Stripe Link, ChatGPT own it).
- **The defensible layer** is the application + human-oversight UX. **The policy engine — control over autonomy — is THE differentiator.** Invest there; never stub it.
- **Settlement:** XRPL testnet. M1 ships **direct-XRPL** (agent signs Payment with a memo nonce, merchant verifies on the ledger) because no hosted testnet x402 facilitator exists as of Jun 2026. **M3+ swap in `x402-xrpl`** if/when a testnet facilitator appears. The wire format is the outer skin; the loop's anatomy doesn't depend on it.
- **v1 frontend: web page.** Pivoted away from Telegram bot (2026-06-18, same day as the bot pivot) because the user found Telegram publishing/hosting nontrivial and prefers a URL anyone can open. RN + Expo mobile and the bot are both deferred; we still have the agent-event-sink abstraction from the bot path, which the web SSE stream reuses unchanged.
- **AI cost model: BYOK only for v1.** User pastes a scoped + capped Anthropic API key in onboarding. On web, BYOK is stored in the browser's `localStorage` (key never leaves the browser; sent per-request to the backend over the SSE call). Funded-wallet model (Leash brokers XRP → Anthropic) is deferred until capital exists.
- **Custody (demo):** backend custodies the agent wallet seed (encrypted at rest); the **policy engine gates signing**. Production would use scoped / smart-account permissions and rotation — state this openly.
- **Build priority:** thin slice first, polish last. M1 already proved the loop.

## Stack (locked for v1)
- **Frontend (v1):** vanilla HTML + CSS + JS in `public/index.html`. No bundler, no framework. **BYOK key lives in browser `localStorage`**; sent in the request header to the backend for each task. Backend reads it, uses it to call Claude (M3+), never persists it server-side.
- **Frontend (deferred):** Telegram bot (`src/bot/` removed; recoverable from git history at commit `e1729dc`); RN + Expo mobile companion.
- **Backend:** Node.js + TypeScript · Express · Server-Sent Events for the live agent feed · in-memory state for the demo; Supabase / Postgres when persistence becomes load-bearing.
- **AI:** Anthropic Claude via tool use (BYOK). Haiku 4.5 by default; Sonnet/Opus only when complexity demands. Aggressive prompt caching.
- **XRPL:** `xrpl.js` · testnet faucet · public testnet explorer for proof. Direct-XRPL in M1+M2; `x402-xrpl` middleware swap-in when a testnet facilitator appears.

## Milestones (build in this order)
1. **M1 — thin slice (DONE 2026-06-17):** agent makes ONE real XRPL testnet payment via the policy engine; logged with amount/service/hash/ledger; tx opens in the public explorer.
2. **M2 — web app v1 (BYOK):** single-page web app at `http://localhost:8080`. BYOK input box for Anthropic key (stored in `localStorage`; not used yet — UX placeholder for M3). Task input + Launch button. Server-Sent Events stream every agent event into a live feed pane. Tx-settled events render with a "View on Explorer" button. Kill Switch toggle. **Deterministic agent for the first cut**; Claude tool use enters at M3.
3. **M3 — Claude reasoning + Approve/Deny + connected wallets:** wire the BYOK key into a Claude tool-use loop. Threshold-triggered payments emit an Approve/Deny modal in the web UI; user clicks to release or refuse the signature. Per-user wallets = **bring-your-own-wallet, not server-generated** — the server generating + holding a seed per user is *more* custodial and contradicts the non-custodial decision. The `/wallet` panel shows the connected address + balance + testnet-faucet button; the **client-signing path** (SDK `payClientSigned` + `/api/quote`→sign-local→`/api/submit`) is what makes it non-custodial against a hosted server. Kill Switch flips the policy engine's `halted` flag and refuses every signature from that moment.
4. **M4 — polish:** richer result presentation (cost breakdown, deliverable formatting), Export, demo video, README polish, open-source. This is the XRPL Grants application material.

## The policy engine (single most important module)
Every payment passes these gates, in order, **before any signature is produced**: (1) not halted → (2) service allowed / not denylisted → (3) per-tx cap → (4) daily cap → (5) total budget remaining → (6) below the manual-approval threshold, else ask the human. Keep it as one well-tested module that all payment paths route through.

Implementation: `src/policy/engine.ts` (the `evaluate()` function). All M1+ payments route through it. The web UI's Approve/Deny modal (M3) IS gate 6 made tactile.

## Conventions & guardrails
- Default to TypeScript. Provide a `.env.example`; **never commit secrets** (wallet seeds, API keys) — env vars only.
- **Testnet only.** No mainnet keys, no real funds, anywhere in this repo.
- Keep the human-in-the-loop controls (Approve / Deny, Kill Switch) wired for real, not mocked — they are the product's point.
- For BYOK on web: key lives in the **browser's `localStorage`**, sent over HTTPS to the backend per-task. **Never persist the key server-side.** Each task uses the key from the incoming request body; backend forgets it the moment the SSE stream closes. The browser owns the secret; Leash never stores it.
- When unsure about XRPL specifics, consult the XRPL AI Starter Kit docs rather than guessing.

## Out of scope (for now)
Mainnet · multiple task types · production-grade custody · funded-wallet AI billing · server-side key persistence · the regional/MENA fintech idea · buying or holding XRP.

## Current progress (2026-07-02)

- **M1 — DONE.** Direct-XRPL thin slice. First settled testnet tx `4B85617C1C393E97A72A9BDD81D34F5C8B718397DAEEDD397A5FD0912EBCDE38` (ledger 18297486). Commit `a79daa0`. Proof: https://testnet.xrpl.org/transactions/4B85617C1C393E97A72A9BDD81D34F5C8B718397DAEEDD397A5FD0912EBCDE38 . Re-verified after the event-stream refactor with tx `B94F2A00AF6802146A817E6D46AA81E37465CBC9A97D92E41B05A72966C6FCCB` (ledger 18331702).
- **M2 — SHIPPED.** Web app at `http://localhost:8080` — vanilla HTML/CSS/JS frontend, Express + SSE backend, same M1 loop streamed live to the browser. BYOK input is in the UX (stored in browser `localStorage`); will plug into Claude at M3. Run: `npm run web`. Walkthrough: `leash_web_demo.html`. End-to-end verified with testnet tx `C1F390CCFC482ED378393B35E3F52A2C5A17E17DA177AF1E79D7284354E0E484` (ledger 18334152) fired from the web UI via `POST /api/task` SSE.
- **Previously-attempted M2 (Telegram bot) — REPLACED.** Telegram bot was scaffolded and committed at `e1729dc`, then removed in this commit because the user prefers a URL anyone can open over a bot that requires Telegram + a publishing step. The `src/agent/events.ts` event-sink abstraction from the bot path was kept — the web SSE stream reuses it unchanged.
- **M3 — DONE (human-in-the-loop controls).** Threshold-triggered **Approve/Deny modal** wired end-to-end: `ask_human` pauses the loop, emits `approval_request`, awaits `POST /api/decision`; verified approve→settles, deny→refuses ("denied by human"). **Kill switch wired server-side** through the policy engine (`src/web/control.ts` halt flag, re-checked before every signature; verified deny at the `halted` gate, no payment). **`/wallet` panel** (address + balance + testnet faucet) live — shows a *connected/demo* wallet; **not** server-generated-per-user (that would be custodial). AI gateway `complete()` wired for real (OpenRouter) — but the agent loop doesn't yet *reason* with it (the one remaining M3 piece; deterministic for now).
- **Approach A scaffold — DONE.** Control-plane-over-rails base: chain-agnostic `PaymentAdapter` (`src/chains/`; XRPL live, Solana/Base/Ethereum stubs), AI model **gateway** (`src/ai/gateway.ts`, OpenRouter catalog), prepaid USD **credits** ledger (`src/credits/`, non-custodial, off by default → BYOK). UI has model + chain selectors + credits/BYOK badge. New APIs: `/api/chains|models|credits|decision|kill|wallet|faucet`. Non-custodial is a DECIDED constraint.
- **M4 — in progress (as of 2026-07-02).** README + MIT `LICENSE` + HTTP API docs done. Added: **23 automated tests** (`npm test` — policy engine's 6 gates + spend tracking + BYOK routing; Node test runner via `tsx`, no new deps), **deploy config** (`Dockerfile` + `render.yaml` + `.dockerignore`; server hardened to respect platform `PORT`) — **Docker image verified locally 2026-07-04**: builds (319MB), boots, serves `/api/policy` 200, and respects `PORT` (ran on 3000 + 8080). And a **demo-readiness + test-plan artifact** (`leash_demo_readiness.html`). BYOK is now **OpenRouter-only** (one `sk-or-` key, user always picks the model — the app never decides one; `AI_MODEL_PICKER`/`AI_DEFAULT_MODEL` removed). Run modes added: **Agent** (demo/live) + **Money** (demo/live) toggles; demo-money simulates settlement (merchant `?demo=1`). Added a **drop-in skill + SDK** (`SKILL.md`, `src/sdk/leash.ts`, `examples/agent.mts`) so an external agent gets policy-gated payments in a few lines — verified against the live server (external agent → governed payment → real testnet settlement). Custody is now stated honestly: **self-host = non-custodial; hosted demo custodies the seed (server signs)**. Sketched the non-custodial-hosted path — SDK `payClientSigned` (two-phase `/api/quote`→sign-local→`/api/submit`); server half is the next milestone. **Remaining human-only gaps to announce "ready":** (1) one real-key AI synthesis run (needs your `sk-or-` key), (2) push the (locally-verified) Docker/Render image to a public URL (needs your Render account), (3) record a 60–90s demo video. *(Per-user wallet generation was dropped from the roadmap — server-generating seeds is custodial; replaced by bring-your-own connected wallet + client-signing.)*
- **Positioning:** see `leash_competitor_analysis.html` — neutral, non-custodial control tower over x402/AP2 + wallet infra; ride the rails, own the governance/UX layer.

## Repo
- Private: https://github.com/muja555/leash
- Main branch: `main` (linear history; M1 commit, M2-Telegram commit, M2-web commit).
