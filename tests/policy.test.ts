import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluate,
  freshSpendState,
  recordSpend,
  rollDayIfNeeded,
} from "../src/policy/engine.js";
import type { PaymentRequest, Policy, SpendState } from "../src/policy/types.js";

const SERVICE = "leash:research";
const DAY_MS = 24 * 60 * 60 * 1000;

function P(over: Partial<Policy> = {}): Policy {
  return {
    totalBudgetUsdCents: 50_000_000,
    perTxCapUsdCents: 200_000,
    dailyCapUsdCents: 5_000_000,
    approvalThresholdUsdCents: 100_000,
    allowlist: new Set([SERVICE]),
    denylist: new Set<string>(),
    halted: false,
    ...over,
  };
}
function req(amountUsdCents: number, service = SERVICE): PaymentRequest {
  return { service, amountUsdCents, destination: "rDest", reason: "r" };
}
const spent = (total: number, today: number): SpendState => ({
  totalSpentUsdCents: total,
  spentTodayUsdCents: today,
  dayStartMs: Date.now(),
});

// ---------- happy path ----------
test("allows a payment under every cap and threshold", () => {
  const d = evaluate(P(), freshSpendState(), req(1000));
  assert.equal(d.kind, "allow");
});

// ---------- gate 1: halted ----------
test("gate 1: halted denies even a valid payment", () => {
  const d = evaluate(P({ halted: true }), freshSpendState(), req(1000));
  assert.equal(d.kind, "deny");
  assert.equal(d.gate, "halted");
});

// ---------- gate 2: allowlist / denylist ----------
test("gate 2: denylisted service is denied", () => {
  const d = evaluate(P({ denylist: new Set([SERVICE]) }), freshSpendState(), req(1000));
  assert.equal(d.kind, "deny");
  assert.equal(d.gate, "service_allowed");
});
test("gate 2: service not on a non-empty allowlist is denied", () => {
  const d = evaluate(P({ allowlist: new Set(["other"]) }), freshSpendState(), req(1000));
  assert.equal(d.kind, "deny");
  assert.equal(d.gate, "service_allowed");
});
test("gate 2: empty allowlist imposes no service restriction", () => {
  const d = evaluate(P({ allowlist: new Set() }), freshSpendState(), req(1000, "anything"));
  assert.equal(d.kind, "allow");
});

// ---------- gate 3: per-tx cap ----------
test("gate 3: amount over the per-tx cap is denied", () => {
  const d = evaluate(P(), freshSpendState(), req(200_001));
  assert.equal(d.kind, "deny");
  assert.equal(d.gate, "per_tx_cap");
});
test("gate 3: amount exactly at the per-tx cap is allowed (uses >)", () => {
  const d = evaluate(P({ approvalThresholdUsdCents: 200_000 }), freshSpendState(), req(200_000));
  assert.equal(d.kind, "allow");
});

// ---------- gate 4: daily cap ----------
test("gate 4: today's spend + amount over the daily cap is denied", () => {
  const d = evaluate(P(), spent(0, 4_900_000), req(200_000)); // 5.1M > 5M
  assert.equal(d.kind, "deny");
  assert.equal(d.gate, "daily_cap");
});
test("gate 4: exactly at the daily cap is allowed", () => {
  const d = evaluate(P({ approvalThresholdUsdCents: 5_000_000 }), spent(0, 4_800_000), req(200_000));
  assert.equal(d.kind, "allow");
});

// ---------- gate 5: total budget ----------
test("gate 5: total spent + amount over the budget is denied", () => {
  const d = evaluate(P({ dailyCapUsdCents: 1e12 }), spent(49_900_000, 0), req(200_000)); // 50.1M > 50M
  assert.equal(d.kind, "deny");
  assert.equal(d.gate, "total_budget");
});

// ---------- gate 6: approval threshold ----------
test("gate 6: amount over the approval threshold asks the human", () => {
  const d = evaluate(P(), freshSpendState(), req(150_000)); // > 100k threshold, < 200k cap
  assert.equal(d.kind, "ask_human");
});
test("gate 6: amount at/under the threshold auto-allows", () => {
  assert.equal(evaluate(P(), freshSpendState(), req(100_000)).kind, "allow");
  assert.equal(evaluate(P(), freshSpendState(), req(99_999)).kind, "allow");
});

// ---------- gate ordering (earlier gates win) ----------
test("ordering: halted beats a denylist hit", () => {
  const d = evaluate(P({ halted: true, denylist: new Set([SERVICE]) }), freshSpendState(), req(1000));
  assert.equal((d as { gate: string }).gate, "halted");
});
test("ordering: denylist beats an over-budget amount", () => {
  const d = evaluate(P({ denylist: new Set([SERVICE]) }), spent(50_000_000, 0), req(999_999_999));
  assert.equal((d as { gate: string }).gate, "service_allowed");
});
test("ordering: per-tx cap beats the daily cap", () => {
  const d = evaluate(P(), spent(0, 4_999_999), req(999_999)); // over both; per-tx checked first
  assert.equal((d as { gate: string }).gate, "per_tx_cap");
});

// ---------- spend tracking ----------
test("recordSpend increments both total and today", () => {
  const s = recordSpend(freshSpendState(), req(1000));
  assert.equal(s.totalSpentUsdCents, 1000);
  assert.equal(s.spentTodayUsdCents, 1000);
});
test("rollDayIfNeeded resets today's spend after 24h, keeps total", () => {
  const start = Date.now() - DAY_MS - 1;
  const s: SpendState = { totalSpentUsdCents: 3_000_000, spentTodayUsdCents: 3_000_000, dayStartMs: start };
  const rolled = rollDayIfNeeded(s, Date.now());
  assert.equal(rolled.spentTodayUsdCents, 0);
  assert.equal(rolled.totalSpentUsdCents, 3_000_000);
});
test("daily cap frees up across a day boundary but total budget persists", () => {
  const start = Date.now() - DAY_MS - 1;
  const s: SpendState = { totalSpentUsdCents: 4_900_000, spentTodayUsdCents: 4_900_000, dayStartMs: start };
  // today resets → daily gate passes; but total 4.9M + 200k = 5.1M is under 50M budget → allow
  const d = evaluate(P({ approvalThresholdUsdCents: 1e9 }), s, req(200_000), Date.now());
  assert.equal(d.kind, "allow");
});
