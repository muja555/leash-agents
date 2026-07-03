import { config } from "./config.js";
import { resolveAsset } from "./xrpl/assets.js";

/**
 * USD is the unit of account. The policy engine gates on USD cents; on-chain
 * settlement is derived per asset — XRP via the configured rate, stablecoins
 * 1:1 with USD.
 */

/** USD cents → XRP drops (string). At least 1 drop. */
export function usdCentsToDrops(cents: number): string {
  const xrp = cents / 100 / config.pricing.xrpUsd;
  return String(Math.max(1, Math.ceil(xrp * 1_000_000)));
}

/** USD cents → decimal token units (stablecoin, 1:1 with USD). */
export function usdCentsToToken(cents: number): string {
  return (cents / 100).toFixed(6);
}

/** XRP drops → USD cents (rounded). */
export function dropsToUsdCents(drops: number | string): number {
  const xrp = Number(drops) / 1_000_000;
  return Math.round(xrp * config.pricing.xrpUsd * 100);
}

/** Whole XRP → USD. */
export function xrpToUsd(xrp: number | string): number {
  return Number(xrp) * config.pricing.xrpUsd;
}

/** The on-chain settle amount (string) for a USD-cent price, in a given asset. */
export function settleAmountFor(usdCents: number, assetId: string): string {
  return resolveAsset(assetId).native ? usdCentsToDrops(usdCents) : usdCentsToToken(usdCents);
}
