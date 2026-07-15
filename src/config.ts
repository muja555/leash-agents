import "dotenv/config";

const env = (k: string, fallback?: string): string => {
  const v = process.env[k] ?? fallback;
  if (v === undefined) throw new Error(`missing required env: ${k}`);
  return v;
};

const envOpt = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
};

const envInt = (k: string, fallback: number): number => {
  const v = process.env[k];
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`env ${k} is not a number: ${v}`);
  return n;
};

const envList = (k: string, fallback: string): string[] =>
  (process.env[k] ?? fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const envBool = (k: string, fallback: boolean): boolean => {
  const v = process.env[k];
  if (v === undefined) return fallback;
  return v === "true" || v === "1";
};

const envFloat = (k: string, fallback: number): number => {
  const v = process.env[k];
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`env ${k} is not a number: ${v}`);
  return n;
};

// ----- Network selection (testnet default; mainnet is opt-in + guarded) -----
// Lifted the testnet-only rule 2026-07-05. Mainnet requires XRPL_LIVE=1 AND an
// explicit acknowledgement (LIVE_MONEY_ACK=1 or the UI ack). Real funds move
// ONLY through the user's connected wallet — the server never holds a mainnet
// seed (see the guard in loadOrFundWallet / the /api/quote non-custodial path).
const live = envBool("XRPL_LIVE", false);
const liveAck = envBool("LIVE_MONEY_ACK", false);
const defaultRpc = live ? "wss://xrplcluster.com" : "wss://s.altnet.rippletest.net:51233";
const defaultExplorer = live ? "https://livenet.xrpl.org" : "https://testnet.xrpl.org";

export const config = {
  xrpl: {
    // True when running against XRPL mainnet with real funds.
    live,
    // Whether the operator has acknowledged real-money risk (env or UI).
    liveAck,
    rpc: env("XRPL_RPC", defaultRpc),
    network: env("XRPL_NETWORK", live ? "xrpl:0" : "xrpl:1"),
    // Public explorer base for building tx links (network-aware).
    explorer: env("XRPL_EXPLORER", defaultExplorer),
    // Mainnet has no faucet; testnet does.
    hasFaucet: !live,
    merchantSeed: envOpt("XRPL_MERCHANT_SEED"),
    agentSeed: envOpt("XRPL_AGENT_SEED"),
  },
  // Leash's platform fee. The merchant address is NOT configured here — it
  // arrives dynamically in each merchant's 402 challenge. This wallet is where
  // Leash collects its cut, paid as a SEPARATE on-chain tx on top of the
  // merchant price. Reads LEASH_FEE_WALLET (falls back to legacy XRPL_PAY_TO).
  fee: {
    wallet: envOpt("LEASH_FEE_WALLET") ?? envOpt("XRPL_PAY_TO"),
    bps: envInt("LEASH_FEE_BPS", 1000), // 1000 bps = 10%
  },
  x402: {
    // Per-call price in USD cents. The policy engine gates on this USD value;
    // the on-chain settle amount is derived per asset (XRP via the rate below,
    // stablecoins 1:1). $0.01 = 1 cent.
    priceUsdCents: envInt("PRICE_USD_CENTS", 1),
  },
  // USD is the unit of account. XRP amounts convert via this rate; stablecoins
  // (USDC/USDT/RLUSD) are 1:1 with USD. Testnet demo value — set XRP_USD_RATE.
  pricing: {
    xrpUsd: envFloat("XRP_USD_RATE", 2.5),
  },
  // Issuers for XRPL stablecoins (issued-currency / IOU). Set to make live
  // settlement in that token possible (the agent wallet also needs a trust line
  // + balance). Blank → the token is demo-only (simulated in Money=Demo).
  assets: {
    usdcIssuer: envOpt("XRPL_USDC_ISSUER"),
    usdtIssuer: envOpt("XRPL_USDT_ISSUER"),
    rlusdIssuer: envOpt("XRPL_RLUSD_ISSUER"),
  },
  merchant: {
    port: envInt("PORT", 8080),
  },
  // Policy caps, all in USD cents (the unit of account). Defaults: $50 budget,
  // $0.50 per-tx cap, $5 daily, $0.25 auto-pay threshold.
  // On mainnet (live), caps are CLAMPED to safe ceilings no matter what env
  // says — a fuse against a fat-fingered budget moving real money. Ceilings:
  // per-tx $1, daily $5, total $20, approval threshold forced down to $0.25.
  policy: {
    totalBudgetUsdCents: live
      ? Math.min(envInt("POLICY_TOTAL_BUDGET_USD_CENTS", 2000), 2000)
      : envInt("POLICY_TOTAL_BUDGET_USD_CENTS", 5000),
    perTxCapUsdCents: live
      ? Math.min(envInt("POLICY_PER_TX_CAP_USD_CENTS", 100), 100)
      : envInt("POLICY_PER_TX_CAP_USD_CENTS", 50),
    dailyCapUsdCents: live
      ? Math.min(envInt("POLICY_DAILY_CAP_USD_CENTS", 500), 500)
      : envInt("POLICY_DAILY_CAP_USD_CENTS", 500),
    approvalThresholdUsdCents: live
      ? Math.min(envInt("POLICY_APPROVAL_THRESHOLD_USD_CENTS", 25), 25)
      : envInt("POLICY_APPROVAL_THRESHOLD_USD_CENTS", 25),
  },
  agent: {
    query: env("AGENT_QUERY", "compare AI coding tools 2026"),
  },
  // ----- Multi-chain (Approach A: control plane over many rails) -----
  // Each id maps to a PaymentAdapter in src/chains/. Only adapters that are
  // both implemented AND listed here are selectable. XRPL is live; the rest are
  // scaffolded stubs — implement src/chains/<id>.ts + add the id here to enable.
  chains: {
    enabled: envList("CHAINS_ENABLED", "xrpl"),
    default: env("DEFAULT_CHAIN", "xrpl"),
  },
  // ----- AI model gateway (the "AI tokens" users spend) -----
  // One OpenRouter integration → every model. The app never picks a model:
  // the user always chooses it in the UI. No default, no host lock.
  ai: {
    gateway: env("AI_GATEWAY", "openrouter"),
    openrouterKey: envOpt("OPENROUTER_API_KEY"),
    markupBps: envInt("AI_MARKUP_BPS", 2000), // 2000 bps = 20% markup on inference
  },
  // ----- Prepaid credits (USD-denominated, non-custodial AI billing) -----
  // Disabled by default → BYOK mode. Enable + back with a real ledger to bill.
  credits: {
    enabled: envBool("CREDITS_ENABLED", false),
    usdCentsPerCredit: envInt("CREDIT_USD_CENTS", 1), // 1 credit = $0.01
    seedUsdCents: envInt("CREDITS_SEED_USD_CENTS", 500), // demo balance: $5.00
  },
  // ----- Funding source ---------------------------------------------------
  // The money the agent spends can come from its own wallet (non-custodial) OR
  // a credit line (e.g. a provider like ClawCredit/t54 fronts it). Leash's
  // policy engine governs the spend either way. This is the demo credit line.
  funding: {
    creditLimitUsdCents: envInt("CREDIT_LINE_USD_CENTS", 2500), // $25 demo credit line
  },
  // ----- Xaman (ex-XUMM) wallet connect -----
  // Xaman signs on the user's phone via a QR/deep-link payload created with
  // these developer credentials. Blank → the Xaman connect option is shown
  // disabled (GemWallet / Crossmark need no server key). Never real user keys.
  xaman: {
    apiKey: envOpt("XUMM_API_KEY"),
    apiSecret: envOpt("XUMM_API_SECRET"),
  },
} as const;
