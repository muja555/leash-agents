import { config } from "../config.js";

// Network-aware explorer links: testnet.xrpl.org on testnet,
// livenet.xrpl.org on mainnet (driven by config.xrpl.explorer / XRPL_LIVE).
export function txExplorerUrl(hash: string): string {
  return `${config.xrpl.explorer}/transactions/${hash}`;
}

export function accountExplorerUrl(address: string): string {
  return `${config.xrpl.explorer}/accounts/${address}`;
}
