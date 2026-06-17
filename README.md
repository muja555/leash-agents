# Leash — M1 thin slice

> Agentic payments on XRPL, with mobile oversight. **This branch is M1 only**: one real testnet payment, with a tx hash you can open in the public explorer.
>
> The mobile app (RN + Expo) lands in M2. See [`CLAUDE.md`](./CLAUDE.md) for the full spec and [`leash_user_journey.html`](./leash_user_journey.html) for the screen flow.

## What M1 proves
- Agent decides it needs a paid resource.
- **Policy engine runs first**, against the real on-the-wire payment requirement, before any signature.
- xrpl.js signs a Payment on testnet.
- The merchant unlocks the data by verifying the tx on the ledger.
- The transaction hash opens in https://testnet.xrpl.org.

That's it. No mobile UI, no Claude reasoning, no WebSocket feed — those come in M2/M3.

## Why "direct XRPL" and not x402 wire?

The spec calls for x402. The reality (Jun 2026): t54's XRPL x402 facilitator is hosted **mainnet only**, and our spec forbids mainnet. There is no off-the-shelf testnet facilitator we can run yet.

So M1 ships the same conceptual loop without the x402 wire: the agent gets a 402 JSON body with `{payTo, amountDrops, nonce}`, sends an XRPL Payment with the nonce in the Memo, then retries with `?tx=<hash>`. The merchant verifies on the ledger.

When a hosted testnet facilitator exists (or we build one), M2 restores the `x402-xrpl` `requirePayment` middleware on the merchant and `x402Fetch` on the agent — about 15 lines added, 80 lines deleted. **The policy engine, wallet helpers, log, and forthcoming mobile UI all live above the wire format and won't change.**

## Setup

```bash
# 1. install deps
npm install

# 2. copy the env template
cp .env.example .env

# 3. (first run only) leave XRPL_MERCHANT_SEED and XRPL_AGENT_SEED blank;
#    the script auto-funds both wallets from the testnet faucet and prints
#    the seeds. Save the printed values into .env for re-runs.
```

## Run

```bash
npm run m1
```

On success you'll see:

```
────────────────────────────────────────────────────────────────
✓ PAYMENT SETTLED ON XRPL TESTNET
  hash:    <64-hex>
  ledger:  <int>
  open:    https://testnet.xrpl.org/transactions/<hash>
────────────────────────────────────────────────────────────────
```

Open that URL — that's M1 done.

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
    m1.ts                deterministic agent: probe → policy → sign → retry → unlock
  log/
    payments.ts          JSON log at data/payments.json
  main.ts                bootstrap: start merchant, run agent once, print explorer URL
```

## The six gates (the differentiator)

Every payment passes these, in order, **before any signature is produced**:

1. Not halted (kill switch)
2. Service allowed (allowlist) / not denylisted
3. Per-tx cap
4. Daily cap
5. Total budget remaining
6. Below the manual-approval threshold — else ask the human (M3+)

Implementation: [`src/policy/engine.ts`](./src/policy/engine.ts). All payment paths route through `evaluate()`.

## Honest M1 simplifications
- **Direct XRPL payment, not x402 wire.** See "Why" section above.
- **Custodial seed.** Backend holds the agent's seed (in `.env` for the demo). Production would scope permissions and rotate.
- **Deterministic agent.** Claude tool-use enters at M3. M1's job is to prove the payment loop end-to-end, not the reasoning.
- **No mobile UI.** That's M2.
- **Canned data behind the paywall.** We control both sides of the demo for uptime; swap in a real paid endpoint later.

## Milestones

- **M1 (this branch)** — one real testnet payment via direct XRPL + ledger verification.
- **M2** — RN + Expo mobile shell (Dashboard, Delegate, Live Run) over WebSocket. Swap the merchant + agent to `x402-xrpl` middleware once a testnet facilitator is available.
- **M3** — policy engine fires Approve/Deny prompts on the phone; kill switch wired.
- **M4** — Result screen, cost breakdown, demo video, open-source.
