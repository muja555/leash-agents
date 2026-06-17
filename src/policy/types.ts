export interface Policy {
  totalBudgetDrops: number;
  perTxCapDrops: number;
  dailyCapDrops: number;
  approvalThresholdDrops: number;
  allowlist: ReadonlySet<string>;
  denylist: ReadonlySet<string>;
  halted: boolean;
}

export interface PaymentRequest {
  service: string;
  amountDrops: number;
  destination: string;
  reason: string;
}

export interface SpendState {
  totalSpentDrops: number;
  spentTodayDrops: number;
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
