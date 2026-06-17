export function txExplorerUrl(hash: string): string {
  return `https://testnet.xrpl.org/transactions/${hash}`;
}

export function accountExplorerUrl(address: string): string {
  return `https://testnet.xrpl.org/accounts/${address}`;
}
