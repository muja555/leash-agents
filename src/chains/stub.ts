import type {
  ChainId,
  PaymentAdapter,
  PaymentReceipt,
  SendPaymentArgs,
} from "./types.js";

/**
 * Placeholder adapter for a chain that's scaffolded but not wired yet. It
 * carries the chain's metadata (so the UI can list it as "coming soon") and
 * throws a clear, actionable error if anything tries to actually transact.
 *
 * To make a chain real: create src/chains/<id>.ts implementing PaymentAdapter
 * (mirror src/chains/xrpl.ts), register it in src/chains/index.ts, add its deps
 * + RPC env, and add its id to CHAINS_ENABLED. No other code changes needed.
 */
export class StubAdapter implements PaymentAdapter {
  readonly implemented = false;

  constructor(
    readonly id: ChainId,
    readonly network: string,
    readonly nativeAsset: string,
    readonly decimals: number,
    private readonly explorerBase: string,
  ) {}

  async loadAgentWallet(): Promise<{ address: string }> {
    throw this.notImplemented();
  }

  async sendPayment(_args: SendPaymentArgs): Promise<PaymentReceipt> {
    throw this.notImplemented();
  }

  explorerUrl(hash: string): string {
    return this.explorerBase + hash;
  }

  async getBalance(): Promise<{ address: string; balance: string }> {
    throw this.notImplemented();
  }

  async fundFromFaucet(): Promise<{ address: string; balance: string }> {
    throw this.notImplemented();
  }

  async pickAutoAsset(): Promise<string> {
    return "XRP";
  }

  private notImplemented(): Error {
    return new Error(
      `chain "${this.id}" is scaffolded but not implemented — add src/chains/${this.id}.ts ` +
        `(mirror xrpl.ts), register it in src/chains/index.ts, and add it to CHAINS_ENABLED.`,
    );
  }
}
