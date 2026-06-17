import type {
  PaymentRequest,
  Policy,
  PolicyDecision,
  SpendState,
} from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function freshSpendState(now: number = Date.now()): SpendState {
  return { totalSpentDrops: 0, spentTodayDrops: 0, dayStartMs: now };
}

export function rollDayIfNeeded(s: SpendState, now: number = Date.now()): SpendState {
  if (now - s.dayStartMs >= DAY_MS) {
    return { totalSpentDrops: s.totalSpentDrops, spentTodayDrops: 0, dayStartMs: now };
  }
  return s;
}

/**
 * The six gates, in order. Every payment passes through this — no caller may
 * bypass it, and no signature is produced if it returns deny or ask_human
 * (caller must wait for the human's response in the ask_human case).
 */
export function evaluate(
  policy: Policy,
  spend: SpendState,
  req: PaymentRequest,
  now: number = Date.now(),
): PolicyDecision {
  const s = rollDayIfNeeded(spend, now);

  // GATE 1 — not halted
  if (policy.halted) {
    return { kind: "deny", gate: "halted", reason: "agent is halted (kill switch active)" };
  }

  // GATE 2 — service allowed / not denylisted
  if (policy.denylist.has(req.service)) {
    return { kind: "deny", gate: "service_allowed", reason: `service "${req.service}" is on the denylist` };
  }
  if (policy.allowlist.size > 0 && !policy.allowlist.has(req.service)) {
    return { kind: "deny", gate: "service_allowed", reason: `service "${req.service}" is not on the allowlist` };
  }

  // GATE 3 — per-tx cap
  if (req.amountDrops > policy.perTxCapDrops) {
    return {
      kind: "deny",
      gate: "per_tx_cap",
      reason: `amount ${req.amountDrops} drops exceeds per-tx cap of ${policy.perTxCapDrops}`,
    };
  }

  // GATE 4 — daily cap
  if (s.spentTodayDrops + req.amountDrops > policy.dailyCapDrops) {
    return {
      kind: "deny",
      gate: "daily_cap",
      reason: `would exceed daily cap (${s.spentTodayDrops} + ${req.amountDrops} > ${policy.dailyCapDrops})`,
    };
  }

  // GATE 5 — total budget
  if (s.totalSpentDrops + req.amountDrops > policy.totalBudgetDrops) {
    return {
      kind: "deny",
      gate: "total_budget",
      reason: `would exceed total budget (${s.totalSpentDrops} + ${req.amountDrops} > ${policy.totalBudgetDrops})`,
    };
  }

  // GATE 6 — below approval threshold, else ask the human
  if (req.amountDrops > policy.approvalThresholdDrops) {
    return {
      kind: "ask_human",
      reason: `amount ${req.amountDrops} drops crosses approval threshold ${policy.approvalThresholdDrops}`,
    };
  }

  return { kind: "allow" };
}

export function recordSpend(
  spend: SpendState,
  req: PaymentRequest,
  now: number = Date.now(),
): SpendState {
  const s = rollDayIfNeeded(spend, now);
  return {
    totalSpentDrops: s.totalSpentDrops + req.amountDrops,
    spentTodayDrops: s.spentTodayDrops + req.amountDrops,
    dayStartMs: s.dayStartMs,
  };
}
