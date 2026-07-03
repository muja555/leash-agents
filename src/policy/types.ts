// All amounts are in USD cents — the unit of account. On-chain settlement in
// XRP/USDC/USDT/RLUSD is derived from these USD values (see src/pricing.ts).
export interface Policy {
  totalBudgetUsdCents: number;
  perTxCapUsdCents: number;
  dailyCapUsdCents: number;
  approvalThresholdUsdCents: number;
  allowlist: ReadonlySet<string>;
  denylist: ReadonlySet<string>;
  halted: boolean;
}

export interface PaymentRequest {
  service: string;
  amountUsdCents: number;
  destination: string;
  reason: string;
}

export interface SpendState {
  totalSpentUsdCents: number;
  spentTodayUsdCents: number;
  dayStartMs: number;
}

export type PolicyDecision =
  | { kind: "allow" }
  | { kind: "ask_human"; reason: string }
  | { kind: "deny"; gate: PolicyGate; reason: string };

export type PolicyGate =
  | "halted"
  | "service_allowed"
  | "per_tx_cap"
  | "daily_cap"
  | "total_budget";
