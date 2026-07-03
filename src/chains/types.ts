/**
 * Chain-agnostic payment layer. The policy engine and agent loop talk only to
 * this interface, so adding a chain = writing one adapter file. XRPL is the
 * live reference implementation; Solana / Base / Ethereum are scaffolded stubs.
 *
 * `amount` is always the chain's smallest integer unit, as a string
 * (XRPL drops, Solana lamports, EVM wei). Conversions live inside the adapter.
 */
export type ChainId = "xrpl" | "solana" | "base" | "ethereum";

export interface SendPaymentArgs {
  destination: string;
  amount: string; // smallest unit (drops/lamports/wei), as a string
  memo?: string;
  asset?: string; // "native" (default) or a token symbol/contract — adapter-defined
}

export interface PaymentReceipt {
  chain: ChainId;
  hash: string;
  ledgerIndex: number; // ledger/slot/block height; -1 if not applicable
  explorer: string;
  amount: string;
  asset?: string; // "XRP" | "USDC" | … (settlement asset)
  destination: string;
}

export interface PaymentAdapter {
  readonly id: ChainId;
  readonly network: string; // CAIP-like: "xrpl:1", "solana:mainnet", "eip155:8453"
  readonly nativeAsset: string; // "XRP" | "SOL" | "ETH"
  readonly decimals: number; // smallest-units per 1 native (6 / 9 / 18)
  readonly implemented: boolean; // false for scaffolded stubs

  /** Load (or auto-fund on testnet) the agent wallet; caches it on the adapter. */
  loadAgentWallet(): Promise<{ address: string }>;
  /** Sign + broadcast a payment and wait for settlement. */
  sendPayment(args: SendPaymentArgs): Promise<PaymentReceipt>;
  explorerUrl(hash: string): string;

  /** Agent wallet address + native balance (human units). For the /wallet panel. */
  getBalance(): Promise<{ address: string; balance: string }>;
  /** Top up the agent wallet from the chain's testnet faucet. */
  fundFromFaucet(): Promise<{ address: string; balance: string }>;
  /** "Auto" mode: pick the asset id to pay in based on the wallet's holdings. */
  pickAutoAsset(): Promise<string>;
}
