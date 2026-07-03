import { config } from "../config.js";

/**
 * Payment assets the agent can settle in. XRP is native (amount in drops).
 * Stablecoins are XRPL issued currencies (IOUs): a `{currency, issuer, value}`
 * amount that requires the payer to hold a trust line to the issuer. Live
 * settlement in a token needs its issuer configured; otherwise it's demo-only.
 */
export type AssetId = "XRP" | "USDC" | "USDT" | "RLUSD";

export interface AssetSpec {
  id: AssetId;
  native: boolean; // XRP
  currency?: string; // XRPL currency code (hex for >3 chars) — tokens only
  issuer?: string; // token issuer address — tokens only
}

const TOKENS: Record<Exclude<AssetId, "XRP">, string | undefined> = {
  USDC: config.assets.usdcIssuer,
  USDT: config.assets.usdtIssuer,
  RLUSD: config.assets.rlusdIssuer,
};

/** XRPL currency code: a 3-char ISO code, else the ASCII bytes as 40-char hex. */
export function currencyHex(code: string): string {
  if (code.length === 3) return code;
  return Buffer.from(code, "ascii").toString("hex").toUpperCase().padEnd(40, "0");
}

export function isAssetId(id: string): id is AssetId {
  return id === "XRP" || id in TOKENS;
}

export function resolveAsset(id: string | undefined): AssetSpec {
  const up = (id ?? "XRP").toUpperCase();
  if (up === "XRP" || !(up in TOKENS)) return { id: "XRP", native: true };
  const key = up as Exclude<AssetId, "XRP">;
  return { id: key, native: false, currency: currencyHex(key), issuer: TOKENS[key] };
}

/** True if the token has an issuer configured (→ live settlement possible). */
export function assetIsLive(id: AssetId): boolean {
  if (id === "XRP") return true;
  return Boolean(TOKENS[id as Exclude<AssetId, "XRP">]);
}

export function listAssets(): { id: AssetId; label: string; live: boolean }[] {
  return (["XRP", "USDC", "USDT", "RLUSD"] as AssetId[]).map((id) => ({
    id,
    label: id,
    live: assetIsLive(id),
  }));
}
