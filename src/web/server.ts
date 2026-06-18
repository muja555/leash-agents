import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import express, { type Request, type Response } from "express";
import type { AgentEvent } from "../agent/events.js";
import { runM1 } from "../agent/m1.js";
import { config } from "../config.js";
import { buildMerchantApp } from "../server/merchant.js";
import { disconnect } from "../xrpl/client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolvePath(__dirname, "..", "..", "public");

interface ApiTaskBody {
  query?: string;
  anthropicKey?: string;
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

  // POST /api/task — body: { query, anthropicKey? }
  // Streams AgentEvent messages as SSE to the browser. The anthropicKey is
  // accepted but NOT used in M2 (no Claude calls yet); it lives here so the
  // M3 wiring is a single-call change.
  app.post("/api/task", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as ApiTaskBody;
    const query = (body.query ?? config.agent.query).slice(0, 500);

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
      totalBudgetDrops: config.policy.totalBudgetDrops,
      perTxCapDrops: config.policy.perTxCapDrops,
      dailyCapDrops: config.policy.dailyCapDrops,
      approvalThresholdDrops: config.policy.approvalThresholdDrops,
      merchantPayTo: payTo,
      network: config.xrpl.network,
    });
  });

  const port = Number(process.env.WEB_PORT ?? config.merchant.port);
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
