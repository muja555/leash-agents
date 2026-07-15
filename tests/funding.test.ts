import { test } from "node:test";
import assert from "node:assert/strict";
import { getCreditLine } from "../src/funding/credit.js";
import { config } from "../src/config.js";

const LIMIT = config.funding.creditLimitUsdCents;

test("credit line: an unconnected line has no borrowing power", () => {
  const c = getCreditLine();
  const s = c.state("t0");
  assert.equal(s.connected, false);
  assert.equal(s.availableUsdCents, 0);
  // limit is only the ceiling you'd get on connect
  assert.equal(s.limitUsdCents, LIMIT);
  // drawing against an unconnected line is refused
  assert.throws(() => c.draw("t0", 1), /no credit line connected/);
});

test("credit line: connecting exposes the full limit as available", () => {
  const c = getCreditLine();
  const s = c.connect("t1");
  assert.equal(s.connected, true);
  assert.equal(s.limitUsdCents, LIMIT);
  assert.equal(s.usedUsdCents, 0);
  assert.equal(s.availableUsdCents, LIMIT);
});

test("credit line: draw reduces available and accumulates used", () => {
  const c = getCreditLine();
  c.connect("t2");
  c.draw("t2", 100);
  c.draw("t2", 50);
  const s = c.state("t2");
  assert.equal(s.usedUsdCents, 150);
  assert.equal(s.availableUsdCents, LIMIT - 150);
});

test("credit line: a draw over the available limit throws (the ceiling gate)", () => {
  const c = getCreditLine();
  c.connect("t3");
  assert.throws(() => c.draw("t3", LIMIT + 1), /exceeds available credit/);
  // and a draw exactly at the limit is allowed
  assert.doesNotThrow(() => c.draw("t3", LIMIT));
  assert.equal(c.available("t3"), 0);
});

test("credit line: reset restores the full limit (line stays connected)", () => {
  const c = getCreditLine();
  c.connect("t4");
  c.draw("t4", 42);
  const s = c.reset("t4");
  assert.equal(s.connected, true);
  assert.equal(s.usedUsdCents, 0);
  assert.equal(s.availableUsdCents, LIMIT);
});

test("credit line: disconnect revokes borrowing power and clears history", () => {
  const c = getCreditLine();
  c.connect("t5");
  c.draw("t5", 100);
  const s = c.disconnect("t5");
  assert.equal(s.connected, false);
  assert.equal(s.usedUsdCents, 0);
  assert.equal(s.availableUsdCents, 0);
});
