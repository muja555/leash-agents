import { test } from "node:test";
import assert from "node:assert/strict";
import { getCreditLine } from "../src/funding/credit.js";
import { config } from "../src/config.js";

const LIMIT = config.funding.creditLimitUsdCents;

test("credit line: fresh state exposes the full limit as available", () => {
  const c = getCreditLine();
  const s = c.reset("t1");
  assert.equal(s.limitUsdCents, LIMIT);
  assert.equal(s.usedUsdCents, 0);
  assert.equal(s.availableUsdCents, LIMIT);
});

test("credit line: draw reduces available and accumulates used", () => {
  const c = getCreditLine();
  c.reset("t2");
  c.draw("t2", 100);
  c.draw("t2", 50);
  const s = c.state("t2");
  assert.equal(s.usedUsdCents, 150);
  assert.equal(s.availableUsdCents, LIMIT - 150);
});

test("credit line: a draw over the available limit throws (the ceiling gate)", () => {
  const c = getCreditLine();
  c.reset("t3");
  assert.throws(() => c.draw("t3", LIMIT + 1), /exceeds available credit/);
  // and a draw exactly at the limit is allowed
  assert.doesNotThrow(() => c.draw("t3", LIMIT));
  assert.equal(c.available("t3"), 0);
});

test("credit line: reset restores the full limit", () => {
  const c = getCreditLine();
  c.draw("t4", 42);
  const s = c.reset("t4");
  assert.equal(s.usedUsdCents, 0);
  assert.equal(s.availableUsdCents, LIMIT);
});
