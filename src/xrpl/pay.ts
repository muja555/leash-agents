import { convertStringToHex, type Payment, type Wallet } from "xrpl";
import { getClient } from "./client.js";

export interface PaymentResult {
  hash: string;
  ledgerIndex: number;
  amountDrops: string;
  destination: string;
}

/**
 * Sign + broadcast an XRP Payment on the configured XRPL network. Waits for
 * the transaction to be validated and returns the on-chain identifiers.
 *
 * An optional `memo` is embedded into the XRPL Memos field (UTF-8 → hex).
 * The merchant verifier uses this memo to bind a specific tx to a specific
 * 402 challenge — that's our anti-replay mechanism for the direct-XRPL M1.
 *
 * For M1 we send native XRP (amount in drops, as a string). RLUSD / other
 * IOUs are deferred to later milestones.
 */
export async function sendXrpPayment(args: {
  wallet: Wallet;
  destination: string;
  amountDrops: string;
  memo?: string;
}): Promise<PaymentResult> {
  const client = await getClient();
  const tx: Payment = {
    TransactionType: "Payment",
    Account: args.wallet.classicAddress,
    Destination: args.destination,
    Amount: args.amountDrops,
  };
  if (args.memo) {
    tx.Memos = [
      {
        Memo: {
          MemoData: convertStringToHex(args.memo),
        },
      },
    ];
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
    amountDrops: args.amountDrops,
    destination: args.destination,
  };
}
