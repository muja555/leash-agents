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

export const config = {
  xrpl: {
    rpc: env("XRPL_RPC", "wss://s.altnet.rippletest.net:51233"),
    network: env("XRPL_NETWORK", "xrpl:1"),
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
    // priceDrops is the per-call price the merchant demands. The key lives
    // under `x402` because in M2 we restore the x402-xrpl middleware and
    // this is the same value the facilitator will see.
    priceDrops: env("XRPL_PRICE_DROPS", "1000"),
  },
  merchant: {
    port: envInt("PORT", 8080),
  },
  policy: {
    totalBudgetDrops: envInt("POLICY_TOTAL_BUDGET_DROPS", 50_000_000),
    perTxCapDrops: envInt("POLICY_PER_TX_CAP_DROPS", 200_000),
    dailyCapDrops: envInt("POLICY_DAILY_CAP_DROPS", 5_000_000),
    approvalThresholdDrops: envInt("POLICY_APPROVAL_THRESHOLD_DROPS", 100_000),
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
} as const;
