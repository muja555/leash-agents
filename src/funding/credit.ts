import { config } from "../config.js";

/**
 * A credit line the agent can spend against instead of its own wallet — the
 * ClawCredit/t54 model, but here the point is that Leash's policy engine
 * governs the spend regardless of source. A credit limit is the *lender's*
 * ceiling; the policy engine adds the *operator's* real-time controls on top.
 *
 * A credit line has to be *connected* first (a provider fronts it) — before
 * that there is no borrowing power, so `available` is $0 and `limit` is only
 * the ceiling you'd get on connect. Nothing is spendable until the user opts
 * in. In-memory for the demo; back with a real credit provider in production.
 */
export interface CreditState {
  connected: boolean;
  limitUsdCents: number;
  usedUsdCents: number;
  availableUsdCents: number;
}

class InMemoryCreditLine {
  private used = new Map<string, number>();
  private connected = new Set<string>();

  state(userId: string): CreditState {
    const isConnected = this.connected.has(userId);
    const limit = config.funding.creditLimitUsdCents;
    const usedUsdCents = this.used.get(userId) ?? 0;
    // Not connected → no line provisioned yet, so nothing is available.
    const availableUsdCents = isConnected ? Math.max(0, limit - usedUsdCents) : 0;
    return { connected: isConnected, limitUsdCents: limit, usedUsdCents, availableUsdCents };
  }

  available(userId: string): number {
    return this.state(userId).availableUsdCents;
  }

  /** Provision the line (a provider agrees to front settlement). */
  connect(userId: string): CreditState {
    this.connected.add(userId);
    return this.state(userId);
  }

  /** Revoke the line — no more borrowing power, spend history cleared. */
  disconnect(userId: string): CreditState {
    this.connected.delete(userId);
    this.used.delete(userId);
    return this.state(userId);
  }

  /** Draw against the line. Throws if not connected or over the limit. */
  draw(userId: string, usdCents: number): CreditState {
    const s = this.state(userId);
    if (!s.connected) {
      throw new Error("no credit line connected — connect one first");
    }
    if (usdCents > s.availableUsdCents) {
      throw new Error(`exceeds available credit: ${usdCents}¢ > ${s.availableUsdCents}¢ available`);
    }
    this.used.set(userId, s.usedUsdCents + usdCents);
    return this.state(userId);
  }

  reset(userId: string): CreditState {
    this.used.set(userId, 0);
    return this.state(userId);
  }
}

let cached: InMemoryCreditLine | null = null;
export function getCreditLine(): InMemoryCreditLine {
  if (!cached) cached = new InMemoryCreditLine();
  return cached;
}
