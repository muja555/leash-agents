import { convertStringToHex, type Payment, type Wallet } from "xrpl";
import type { AssetSpec } from "./assets.js";
import { getClient } from "./client.js";

export interface PaymentResult {
  hash: string;
  ledgerIndex: number;
  amount: string; // drops (XRP) or decimal token units (IOU)
  asset: string; // "XRP" | "USDC" | …
  destination: string;
}

const XRP: AssetSpec = { id: "XRP", native: true };

/**
 * Sign + broadcast an XRPL Payment and wait for validation. Settles in native
 * XRP (`amount` = drops) or an issued currency / stablecoin (`amount` = decimal
 * token units, e.g. "0.01"), depending on `asset`. An optional `memo` binds the
 * tx to a specific 402 challenge (anti-replay).
 */
export async function sendXrpPayment(args: {
  wallet: Wallet;
  destination: string;
  amount: string;
  asset?: AssetSpec;
  memo?: string;
}): Promise<PaymentResult> {
  const client = await getClient();
  const asset = args.asset ?? XRP;

  let Amount: Payment["Amount"];
  if (asset.native) {
    Amount = args.amount; // drops as a string
  } else {
    if (!asset.issuer) {
      throw new Error(
        `no issuer configured for ${asset.id} — set XRPL_${asset.id}_ISSUER and fund a trust line for live ${asset.id} settlement (or use Money=Demo).`,
      );
    }
    Amount = { currency: asset.currency as string, issuer: asset.issuer, value: args.amount };
  }

  const tx: Payment = {
    TransactionType: "Payment",
    Account: args.wallet.classicAddress,
    Destination: args.destination,
    Amount,
  };
  if (args.memo) {
    tx.Memos = [{ Memo: { MemoData: convertStringToHex(args.memo) } }];
  }

  const result = await client.submitAndWait(tx, { wallet: args.wallet });
  const meta = result.result.meta;
  const status =
    typeof meta === "object" && meta !== null && "TransactionResult" in meta
      ? (meta as { TransactionResult: string }).TransactionResult
      : "unknown";
  if (status !== "tesSUCCESS") {
    throw new Error(`xrpl payment failed: ${status}`);
  }
  return {
    hash: result.result.hash,
    ledgerIndex: result.result.ledger_index ?? -1,
    amount: args.amount,
    asset: asset.id,
    destination: args.destination,
  };
}
