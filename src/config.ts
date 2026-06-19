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

export const config = {
  xrpl: {
    rpc: env("XRPL_RPC", "wss://s.altnet.rippletest.net:51233"),
    network: env("XRPL_NETWORK", "xrpl:1"),
    merchantSeed: envOpt("XRPL_MERCHANT_SEED"),
    payTo: envOpt("XRPL_PAY_TO"),
    agentSeed: envOpt("XRPL_AGENT_SEED"),
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
} as const;
