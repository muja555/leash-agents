import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import express, { type Request, type Response } from "express";
import type { AgentEvent } from "../agent/events.js";
import { runM1 } from "../agent/m1.js";
import { getGateway } from "../ai/gateway.js";
import { getAdapter, isChainId, listChains, resolveChain } from "../chains/index.js";
import { isAssetId, listAssets } from "../xrpl/assets.js";
import { config } from "../config.js";
import { centsToCredits, getCredits } from "../credits/ledger.js";
import { buildMerchantApp } from "../server/merchant.js";
import { createApproval, isHalted, resolveApproval, setHalted } from "./control.js";
import { disconnect } from "../xrpl/client.js";

// Single demo user for the in-memory credits ledger (M3 adds real auth).
const DEMO_USER = "demo";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolvePath(__dirname, "..", "..", "public");

// Supported BYOK providers. The key itself is never persisted server-side; it
// only rides along in the request body so the M3 reasoning step can use it.
const AI_PROVIDERS = ["anthropic", "openai", "gemini", "grok"] as const;
type AiProvider = (typeof AI_PROVIDERS)[number];

interface ApiTaskBody {
  query?: string;
  provider?: string;
  apiKey?: string;
  anthropicKey?: string; // legacy single-key field (pre multi-provider)
  minUsdCents?: number; // auto-approve threshold (approvalThresholdUsdCents)
  maxUsdCents?: number; // per-payment cap (perTxCapUsdCents)
  chain?: string; // settlement chain id (xrpl | solana | base | …)
  asset?: string; // payment asset (XRP | USDC | USDT | RLUSD)
  model?: string; // AI gateway model id (used by the M3 reasoning step)
  liveAgent?: boolean; // true = real AI reasoning; false = deterministic demo
  liveMoney?: boolean; // true = real on-chain payment; false = simulated demo
}

/** Coerce a body value to a positive integer USD-cents amount, else undefined. */
function centsOrUndefined(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

export async function startWeb(): Promise<void> {
  console.log("=".repeat(64));
  console.log("LEASH · M2 web app — same loop, in a browser");
  console.log("=".repeat(64));

  // Reuse the M1 merchant — it brings the /research endpoint, the
  // nonce-bound 402 challenge, and an auto-funded testnet wallet.
  const { app, payTo } = await buildMerchantApp();

  // Serve the static frontend
  app.use(express.static(PUBLIC_DIR));
  app.use(express.json({ limit: "64kb" }));

  // POST /api/task — body: { query, provider?, apiKey? }  (legacy: anthropicKey)
  // Streams AgentEvent messages as SSE to the browser. The provider + apiKey are
  // accepted but NOT used in M2 (no model calls yet); they live here so the M3
  // wiring is a single-call change. The key is never persisted server-side.
  app.post("/api/task", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as ApiTaskBody;
    const query = (body.query ?? config.agent.query).slice(0, 500);

    // Normalize BYOK selection. Falls back to the legacy anthropicKey field so
    // older browser tabs keep working. Unknown providers default to anthropic.
    const provider: AiProvider = AI_PROVIDERS.includes(body.provider as AiProvider)
      ? (body.provider as AiProvider)
      : "anthropic";
    const apiKey = body.apiKey ?? body.anthropicKey;
    const model = body.model || undefined; // app never substitutes a model
    const chain = resolveChain(body.chain);
    const asset = isAssetId(String(body.asset)) ? String(body.asset) : "XRP";
    void provider; // legacy field — provider is now derived from the model id

    // Min/max (USD cents) from the Policy card flow into the REAL engine.
    const approvalThresholdUsdCents = centsOrUndefined(body.minUsdCents);
    const perTxCapUsdCents = centsOrUndefined(body.maxUsdCents);

    // Setup SSE stream — disable Nagle so each event flushes to the socket immediately
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    req.socket.setNoDelay(true);
    req.socket.setKeepAlive(true);

    // Track client disconnect. `req.on('close')` fires when the request body
    // stream ends — even mid-response — so we listen on `res.on('close')` which
    // only fires when the client actually disconnects.
    let closed = false;
    res.on("close", () => {
      closed = true;
    });

    const write = (event: string, data: unknown): void => {
      if (closed) return;
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      res.write(payload);
    };

    try {
      await runM1({
        merchantPort: config.merchant.port,
        merchantPayTo: payTo,
        query,
        chain,
        asset,
        model,
        aiKey: apiKey,
        userId: DEMO_USER,
        liveAgent: body.liveAgent !== false, // default live
        liveMoney: body.liveMoney !== false, // default live
        policy: { approvalThresholdUsdCents, perTxCapUsdCents },
        isHalted, // server-side kill switch — refused mid-run
        requestApproval: async (info) => {
          // Gate 6: emit the request to the UI, then await the user's decision.
          const { id, wait } = createApproval();
          write("agent", {
            type: "approval_request",
            approvalId: id,
            amountUsdCents: info.amountUsdCents,
            destination: info.destination,
            reason: info.reason,
            kind: info.kind,
          });
          return wait;
        },
        onEvent: (e: AgentEvent) => {
          write("agent", e);
        },
      });
      write("done", { ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      write("agent", { type: "error", message });
      write("done", { ok: false, error: message });
    } finally {
      res.end();
    }
  });

  // GET /api/policy — read-only policy view for the UI
  app.get("/api/policy", (_req, res) => {
    res.json({
      // USD cents — the unit of account (settlement asset derived per payment).
      totalBudgetUsdCents: config.policy.totalBudgetUsdCents,
      perTxCapUsdCents: config.policy.perTxCapUsdCents,
      dailyCapUsdCents: config.policy.dailyCapUsdCents,
      approvalThresholdUsdCents: config.policy.approvalThresholdUsdCents,
      xrpUsd: config.pricing.xrpUsd, // for showing an XRP-balance's USD value
      merchantPayTo: payTo,
      network: config.xrpl.network,
      feeBps: config.fee.wallet ? config.fee.bps : 0,
      feeWallet: config.fee.wallet ?? null,
    });
  });

  // GET /api/chains — settlement chains the control plane can route to
  app.get("/api/chains", (_req, res) => {
    res.json({ chains: listChains(), default: resolveChain() });
  });

  // GET /api/assets — payment assets the agent can settle in (XRP + stablecoins)
  app.get("/api/assets", (_req, res) => {
    res.json({ assets: listAssets(), default: "AUTO" });
  });

  // GET /api/models — the AI model catalog ("AI tokens" users can pick)
  app.get("/api/models", (_req, res) => {
    const gw = getGateway();
    res.json({ gateway: gw.id, gatewayReady: gw.enabled, models: gw.listModels() });
  });

  // GET /api/credits — prepaid balance (BYOK mode when disabled)
  app.get("/api/credits", async (_req, res) => {
    const credits = getCredits();
    const usdCents = await credits.getBalanceUsdCents(DEMO_USER);
    res.json({
      enabled: credits.enabled,
      usdCents,
      credits: centsToCredits(usdCents),
      usdCentsPerCredit: config.credits.usdCentsPerCredit,
    });
  });

  // POST /api/decision — resolve a pending human approval (Approve/Deny modal)
  app.post("/api/decision", (req: Request, res: Response) => {
    const { approvalId, decision } = (req.body ?? {}) as { approvalId?: string; decision?: string };
    if (!approvalId || (decision !== "approve" && decision !== "deny")) {
      res.status(400).json({ ok: false, error: "need { approvalId, decision: 'approve'|'deny' }" });
      return;
    }
    const ok = resolveApproval(approvalId, decision);
    res.status(ok ? 200 : 404).json({ ok });
  });

  // GET/POST /api/kill — the server-side kill switch the policy engine reads
  app.get("/api/kill", (_req, res) => res.json({ halted: isHalted() }));
  app.post("/api/kill", (req: Request, res: Response) => {
    const { halted } = (req.body ?? {}) as { halted?: boolean };
    setHalted(Boolean(halted));
    res.json({ halted: isHalted() });
  });

  // GET /api/wallet?chain= — agent wallet address + balance (per chain)
  app.get("/api/wallet", async (req: Request, res: Response) => {
    const chainId = resolveChain(typeof req.query.chain === "string" ? req.query.chain : undefined);
    try {
      const w = await getAdapter(chainId).getBalance();
      res.json({ chain: chainId, ...w });
    } catch (err) {
      res.status(503).json({ chain: chainId, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /api/faucet?chain= — top up the agent wallet from the testnet faucet
  app.post("/api/faucet", async (req: Request, res: Response) => {
    const raw = typeof req.query.chain === "string" ? req.query.chain : undefined;
    const chainId = resolveChain(raw);
    if (raw && !isChainId(raw)) {
      res.status(400).json({ error: `unknown chain: ${raw}` });
      return;
    }
    try {
      const w = await getAdapter(chainId).fundFromFaucet();
      res.json({ chain: chainId, ...w });
    } catch (err) {
      res.status(503).json({ chain: chainId, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Number("") is 0 (falsy) so an empty WEB_PORT falls through to PORT/8080.
  const port = Number(process.env.WEB_PORT) || config.merchant.port;
  await new Promise<void>((resolve) => app.listen(port, resolve));
  console.log(`[web] open in your browser: http://localhost:${port}`);
  console.log(`[web] merchant payTo (testnet): ${payTo}`);

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[web] ${signal} received, shutting down…`);
    await disconnect();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

const isMain = process.argv[1]?.endsWith("server.ts");
if (isMain) {
  startWeb().catch((err) => {
    console.error("[web] fatal:", err);
    process.exit(1);
  });
}
