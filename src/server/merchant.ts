import { randomBytes } from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import { convertHexToString } from "xrpl";
import { config } from "../config.js";
import { getClient, loadOrFundWallet } from "../xrpl/client.js";

const SERVICE = "leash:research";
const NONCE_TTL_MS = 10 * 60 * 1000;

function resultsFor(query: string): string[] {
  return (
    CANNED_RESEARCH[query] ?? [
      `(canned) No prepared dataset for "${query}". This stub proves the direct-XRPL → data round trip.`,
    ]
  );
}

const CANNED_RESEARCH: Record<string, string[]> = {
  "compare AI coding tools 2026": [
    "Cursor leads with native MCP + multi-model routing; Claude Code's Sonnet 4.6 mode is preferred for refactors per recent dev polls.",
    "Cline and Aider dominate BYOK power-users; both shipped persistent memory across sessions in Q1 2026.",
    "GitHub Copilot Workspace hit general availability — early reviews call it 'first real Cursor competitor in a year.'",
  ],
};

interface PendingRequirement {
  service: string;
  amountDrops: string;
  payTo: string;
  issuedAt: number;
}

const pending = new Map<string, PendingRequirement>();

function newNonce(): string {
  return `leash-${randomBytes(8).toString("hex")}`;
}

function purgeExpired(now = Date.now()): void {
  for (const [n, r] of pending) {
    if (now - r.issuedAt > NONCE_TTL_MS) pending.delete(n);
  }
}

interface LedgerTxBody {
  Account?: string;
  Destination?: string;
  // XRP Amount is normally a drops string. Across xrpl.js versions it has
  // been seen as a string, a number, or wrapped as { value, currency }. We
  // accept anything BigInt-coerceable; IOU objects (cross-currency) are
  // explicitly rejected — M1 is XRP only.
  Amount?: string | number | { currency?: string; value?: string; issuer?: string };
  DeliverMax?: string | number;
  TransactionType?: string;
  Memos?: { Memo?: { MemoData?: string } }[];
}

interface LedgerTxResult extends LedgerTxBody {
  // xrpl.js v4 nests the tx body here; older versions kept it at top level.
  // We read from tx_json first, fall back to top level.
  tx_json?: LedgerTxBody;
  meta?: { TransactionResult?: string } | string;
  validated?: boolean;
  ledger_index?: number;
  inLedger?: number;
  date?: number;
}

function txBody(tx: LedgerTxResult): LedgerTxBody {
  return tx.tx_json ?? tx;
}

function txMetaResult(tx: LedgerTxResult): string | null {
  if (typeof tx.meta === "object" && tx.meta?.TransactionResult) return tx.meta.TransactionResult;
  return null;
}

function txMemoString(tx: LedgerTxResult): string | null {
  const memoHex = txBody(tx).Memos?.[0]?.Memo?.MemoData;
  if (!memoHex) return null;
  try {
    return convertHexToString(memoHex);
  } catch {
    return null;
  }
}

function issue402(res: Response, payTo: string): void {
  const nonce = newNonce();
  pending.set(nonce, {
    service: SERVICE,
    amountDrops: config.x402.priceDrops,
    payTo,
    issuedAt: Date.now(),
  });
  res.status(402).json({
    error: "Payment Required",
    service: SERVICE,
    network: config.xrpl.network,
    asset: "XRP",
    payTo,
    amountDrops: config.x402.priceDrops,
    nonce,
    memo: nonce,
    instructions:
      "Submit an XRPL Payment to `payTo` for `amountDrops` (or more) with `memo` embedded in the Memos field (UTF-8). Then retry the same URL with `?tx=<hash>`.",
  });
}

async function verifyAndUnlock(
  txHash: string,
  query: string,
  res: Response,
): Promise<void> {
  const client = await getClient();
  let txResp: { result: LedgerTxResult };
  try {
    txResp = (await client.request({ command: "tx", transaction: txHash })) as unknown as {
      result: LedgerTxResult;
    };
  } catch (err) {
    res.status(402).json({ error: `tx not found on ledger: ${err instanceof Error ? err.message : err}` });
    return;
  }
  const tx = txResp.result;

  if (!tx.validated) {
    res.status(402).json({ error: "tx not yet validated" });
    return;
  }
  const body = txBody(tx);
  if (body.TransactionType !== "Payment") {
    res.status(402).json({ error: `tx is not a Payment (got ${body.TransactionType ?? "?"})` });
    return;
  }
  const metaResult = txMetaResult(tx);
  if (metaResult !== "tesSUCCESS") {
    res.status(402).json({ error: `tx failed on ledger: ${metaResult ?? "unknown"}` });
    return;
  }
  const memo = txMemoString(tx);
  if (!memo) {
    res.status(402).json({ error: "tx has no UTF-8 memo — cannot match a payment requirement" });
    return;
  }
  purgeExpired();
  const requirement = pending.get(memo);
  if (!requirement) {
    res.status(402).json({ error: "memo does not match any outstanding requirement (expired or never issued)" });
    return;
  }
  if (body.Destination !== requirement.payTo) {
    res.status(402).json({ error: `destination mismatch: tx=${body.Destination} required=${requirement.payTo}` });
    return;
  }
  const rawAmount = body.Amount ?? body.DeliverMax;
  if (rawAmount === undefined) {
    res.status(402).json({ error: "tx has no Amount field" });
    return;
  }
  if (typeof rawAmount === "object" && rawAmount !== null) {
    res.status(402).json({ error: "cross-currency Amount detected; only native XRP supported in M1" });
    return;
  }
  let paid: bigint;
  let demanded: bigint;
  try {
    paid = BigInt(String(rawAmount));
    demanded = BigInt(requirement.amountDrops);
  } catch {
    res.status(402).json({ error: `invalid drops integer: ${JSON.stringify(rawAmount)}` });
    return;
  }
  if (paid < demanded) {
    res.status(402).json({ error: `underpaid: ${paid} < ${demanded}` });
    return;
  }

  // ✓ all checks pass — one-shot consume the nonce
  pending.delete(memo);
  const ledger = tx.ledger_index ?? tx.inLedger ?? -1;

  const results = resultsFor(query);

  res.set("X-XRPL-Tx-Hash", txHash);
  res.set("X-XRPL-Ledger-Index", String(ledger));
  res.json({
    query,
    service: requirement.service,
    results,
    paymentProof: { hash: txHash, ledgerIndex: ledger, amountDrops: String(rawAmount) },
    ts: new Date().toISOString(),
  });
}

export async function buildMerchantApp(): Promise<{ app: Express; payTo: string }> {
  const merchantWallet = await loadOrFundWallet(config.xrpl.merchantSeed, "merchant");
  // The merchant's receive address is its own wallet — in production this is
  // whatever the external paid service puts in its 402, never a Leash setting.
  const payTo = merchantWallet.classicAddress;

  const app = express();

  app.get("/research", async (req: Request, res: Response) => {
    const txHash = typeof req.query.tx === "string" ? req.query.tx : null;
    const query = typeof req.query.q === "string" ? req.query.q : config.agent.query;
    // Demo-money mode: serve results without an on-chain payment proof. The
    // policy engine still runs agent-side; this only skips real settlement.
    if (req.query.demo === "1") {
      res.json({
        query,
        service: SERVICE,
        results: resultsFor(query),
        paymentProof: { hash: "demo", ledgerIndex: 0, amountDrops: "0", simulated: true },
        ts: new Date().toISOString(),
      });
      return;
    }
    if (!txHash) {
      issue402(res, payTo);
      return;
    }
    await verifyAndUnlock(txHash, query, res);
  });

  app.get("/healthz", (_req, res) => res.json({ ok: true, payTo }));

  return { app, payTo };
}

export async function startMerchant(): Promise<{ payTo: string; port: number }> {
  const { app, payTo } = await buildMerchantApp();
  const port = config.merchant.port;
  await new Promise<void>((resolve) => app.listen(port, resolve));
  console.log(`[merchant] listening on http://127.0.0.1:${port} · payTo=${payTo}`);
  return { payTo, port };
}

// Allow running standalone: `npm run merchant`
const isMain = process.argv[1]?.endsWith("merchant.ts");
if (isMain) {
  startMerchant().catch((err) => {
    console.error("[merchant] failed to start:", err);
    process.exit(1);
  });
}
