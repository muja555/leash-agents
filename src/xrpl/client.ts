import { Client, Wallet } from "xrpl";
import { config } from "../config.js";

let cachedClient: Client | null = null;

export async function getClient(): Promise<Client> {
  if (cachedClient && cachedClient.isConnected()) return cachedClient;
  const c = new Client(config.xrpl.rpc);
  await c.connect();
  cachedClient = c;
  return c;
}

export async function disconnect(): Promise<void> {
  if (cachedClient?.isConnected()) await cachedClient.disconnect();
  cachedClient = null;
}

/**
 * Load a wallet from a seed. If the seed is missing, create a fresh testnet
 * wallet via the faucet and print save-this-to-.env instructions.
 *
 * The role label ("merchant" / "agent") only affects the printed instructions.
 */
export async function loadOrFundWallet(
  seed: string | undefined,
  role: "merchant" | "agent",
): Promise<Wallet> {
  const client = await getClient();
  if (seed) {
    const w = Wallet.fromSeed(seed);
    return w;
  }
  console.log(`\n[xrpl] no XRPL_${role.toUpperCase()}_SEED set — funding a fresh testnet wallet from the faucet…`);
  const { wallet, balance } = await client.fundWallet();
  const envKey = role === "merchant" ? "XRPL_MERCHANT_SEED" : "XRPL_AGENT_SEED";
  const addrKey = role === "merchant" ? "XRPL_PAY_TO" : "(agent address — informational)";
  console.log(`[xrpl] funded ${role} wallet:`);
  console.log(`  ${envKey}=${wallet.seed}`);
  console.log(`  ${addrKey}=${wallet.classicAddress}`);
  console.log(`  balance: ${balance} XRP`);
  console.log(`[xrpl] save the line(s) above into .env to reuse the wallet on the next run.\n`);
  return wallet;
}
