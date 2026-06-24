import { config } from "../config.js";
import { StubAdapter } from "./stub.js";
import type { ChainId, PaymentAdapter } from "./types.js";
import { XrplAdapter } from "./xrpl.js";

export type { ChainId, PaymentAdapter, PaymentReceipt, SendPaymentArgs } from "./types.js";

/**
 * Chain registry. Add a new chain by importing its adapter and adding a factory
 * here. Stubs keep the UI honest (listed as "coming soon") until implemented.
 */
const registry: Record<ChainId, () => PaymentAdapter> = {
  xrpl: () => new XrplAdapter(),
  solana: () => new StubAdapter("solana", "solana:mainnet", "SOL", 9, "https://solscan.io/tx/"),
  base: () => new StubAdapter("base", "eip155:8453", "ETH", 18, "https://basescan.org/tx/"),
  ethereum: () => new StubAdapter("ethereum", "eip155:1", "ETH", 18, "https://etherscan.io/tx/"),
};

const KNOWN = Object.keys(registry) as ChainId[];

export function isChainId(id: string): id is ChainId {
  return (KNOWN as string[]).includes(id);
}

/** A chain is selectable only if its adapter is implemented AND enabled in config. */
export function isEnabled(id: ChainId): boolean {
  return registry[id]().implemented && config.chains.enabled.includes(id);
}

export function getAdapter(id: ChainId): PaymentAdapter {
  const make = registry[id];
  if (!make) throw new Error(`unknown chain: ${id}`);
  return make();
}

export interface ChainInfo {
  id: ChainId;
  network: string;
  nativeAsset: string;
  decimals: number;
  enabled: boolean;
  implemented: boolean;
}

export function listChains(): ChainInfo[] {
  return KNOWN.map((id) => {
    const a = registry[id]();
    return {
      id: a.id,
      network: a.network,
      nativeAsset: a.nativeAsset,
      decimals: a.decimals,
      implemented: a.implemented,
      enabled: isEnabled(id),
    };
  });
}

/** Resolve the chain to use for a run: requested → default → xrpl. */
export function resolveChain(requested?: string): ChainId {
  if (requested && isChainId(requested) && isEnabled(requested)) return requested;
  const def = config.chains.default;
  if (isChainId(def) && isEnabled(def)) return def;
  return "xrpl";
}
