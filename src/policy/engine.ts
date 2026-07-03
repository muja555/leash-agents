import type {
  PaymentRequest,
  Policy,
  PolicyDecision,
  SpendState,
} from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function freshSpendState(now: number = Date.now()): SpendState {
  return { totalSpentUsdCents: 0, spentTodayUsdCents: 0, dayStartMs: now };
}

export function rollDayIfNeeded(s: SpendState, now: number = Date.now()): SpendState {
  if (now - s.dayStartMs >= DAY_MS) {
    return { totalSpentUsdCents: s.totalSpentUsdCents, spentTodayUsdCents: 0, dayStartMs: now };
  }
  return s;
}

/**
 * The six gates, in order. Every payment passes through this — no caller may
 * bypass it, and no signature is produced if it returns deny or ask_human
 * (caller must wait for the human's response in the ask_human case). All
 * amounts are USD cents (the unit of account).
 */
export function evaluate(
  policy: Policy,
  spend: SpendState,
  req: PaymentRequest,
  now: number = Date.now(),
): PolicyDecision {
  const s = rollDayIfNeeded(spend, now);
  const amt = req.amountUsdCents;

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
  if (amt > policy.perTxCapUsdCents) {
    return {
      kind: "deny",
      gate: "per_tx_cap",
      reason: `amount ${amt}¢ exceeds per-tx cap of ${policy.perTxCapUsdCents}¢`,
    };
  }

  // GATE 4 — daily cap
  if (s.spentTodayUsdCents + amt > policy.dailyCapUsdCents) {
    return {
      kind: "deny",
      gate: "daily_cap",
      reason: `would exceed daily cap (${s.spentTodayUsdCents} + ${amt} > ${policy.dailyCapUsdCents}¢)`,
    };
  }

  // GATE 5 — total budget
  if (s.totalSpentUsdCents + amt > policy.totalBudgetUsdCents) {
    return {
      kind: "deny",
      gate: "total_budget",
      reason: `would exceed total budget (${s.totalSpentUsdCents} + ${amt} > ${policy.totalBudgetUsdCents}¢)`,
    };
  }

  // GATE 6 — below approval threshold, else ask the human
  if (amt > policy.approvalThresholdUsdCents) {
    return {
      kind: "ask_human",
      reason: `amount ${amt}¢ crosses approval threshold ${policy.approvalThresholdUsdCents}¢`,
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
    totalSpentUsdCents: s.totalSpentUsdCents + req.amountUsdCents,
    spentTodayUsdCents: s.spentTodayUsdCents + req.amountUsdCents,
    dayStartMs: s.dayStartMs,
  };
}
