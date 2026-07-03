import type { Wallet } from "xrpl";
import { resolveAsset } from "../xrpl/assets.js";
import { config } from "../config.js";
import { getClient, loadOrFundWallet } from "../xrpl/client.js";
import { txExplorerUrl } from "../xrpl/explorer.js";
import { sendXrpPayment } from "../xrpl/pay.js";
import type { PaymentAdapter, PaymentReceipt, SendPaymentArgs } from "./types.js";

/**
 * Live XRPL adapter — wraps the existing M1 primitives. This is the reference
 * implementation every other chain adapter mirrors.
 */
export class XrplAdapter implements PaymentAdapter {
  readonly id = "xrpl" as const;
  readonly network = config.xrpl.network;
  readonly nativeAsset = "XRP";
  readonly decimals = 6;
  readonly implemented = true;

  private wallet: Wallet | null = null;

  async loadAgentWallet(): Promise<{ address: string }> {
    this.wallet = await loadOrFundWallet(config.xrpl.agentSeed, "agent");
    return { address: this.wallet.classicAddress };
  }

  async sendPayment(args: SendPaymentArgs): Promise<PaymentReceipt> {
    if (!this.wallet) throw new Error("xrpl: call loadAgentWallet() before sendPayment()");
    const asset = resolveAsset(args.asset); // "XRP" (native) or a stablecoin IOU
    const r = await sendXrpPayment({
      wallet: this.wallet,
      destination: args.destination,
      amount: args.amount,
      asset,
      memo: args.memo,
    });
    return {
      chain: this.id,
      hash: r.hash,
      ledgerIndex: r.ledgerIndex,
      explorer: this.explorerUrl(r.hash),
      amount: r.amount,
      asset: r.asset,
      destination: r.destination,
    };
  }

  explorerUrl(hash: string): string {
    return txExplorerUrl(hash);
  }

  private async ensureWallet(): Promise<Wallet> {
    if (!this.wallet) await this.loadAgentWallet();
    return this.wallet as Wallet;
  }

  async getBalance(): Promise<{ address: string; balance: string }> {
    const w = await this.ensureWallet();
    const client = await getClient();
    const balance = await client.getXrpBalance(w.classicAddress);
    return { address: w.classicAddress, balance: String(balance) };
  }

  async fundFromFaucet(): Promise<{ address: string; balance: string }> {
    const w = await this.ensureWallet();
    const client = await getClient();
    const { balance } = await client.fundWallet(w);
    return { address: w.classicAddress, balance: String(balance) };
  }
}
