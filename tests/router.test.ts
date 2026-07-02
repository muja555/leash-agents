import { test } from "node:test";
import assert from "node:assert/strict";
import { decideRoute } from "../src/ai/providers/router.js";

const ID = "anthropic/claude-haiku-4.5";

// BYOK is OpenRouter-only: every key routes through OpenRouter with the full id.
test("a per-request key routes through OpenRouter with the full model id", () => {
  const d = decideRoute(ID, "sk-or-abc", undefined);
  assert.equal(d.via, "openrouter");
  assert.equal(d.modelId, ID);
  assert.equal(d.key, "sk-or-abc");
});

test("a non-sk-or key is still treated as an OpenRouter key", () => {
  const d = decideRoute(ID, "sk-ant-legacy", undefined);
  assert.equal(d.via, "openrouter");
  assert.equal(d.key, "sk-ant-legacy");
});

test("no per-request key falls back to the configured gateway key", () => {
  const d = decideRoute(ID, undefined, "sk-or-configured");
  assert.equal(d.via, "openrouter");
  assert.equal(d.key, "sk-or-configured");
});

test("per-request key takes precedence over the configured key", () => {
  const d = decideRoute(ID, "sk-or-user", "sk-or-configured");
  assert.equal(d.key, "sk-or-user");
});

test("no key at all is an error", () => {
  const d = decideRoute(ID, undefined, undefined);
  assert.equal(d.via, "error");
  assert.match(d.message ?? "", /OpenRouter/);
});
