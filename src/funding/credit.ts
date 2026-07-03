import { config } from "../config.js";

/**
 * A credit line the agent can spend against instead of its own wallet — the
 * ClawCredit/t54 model, but here the point is that Leash's policy engine
 * governs the spend regardless of source. A credit limit is the *lender's*
 * ceiling; the policy engine adds the *operator's* real-time controls on top.
 *
 * In-memory for the demo; back with a real credit provider in production.
 */
export interface CreditState {
  limitUsdCents: number;
  usedUsdCents: number;
  availableUsdCents: number;
}

class InMemoryCreditLine {
  private used = new Map<string, number>();

  state(userId: string): CreditState {
    const limit = config.funding.creditLimitUsdCents;
    const usedUsdCents = this.used.get(userId) ?? 0;
    return { limitUsdCents: limit, usedUsdCents, availableUsdCents: Math.max(0, limit - usedUsdCents) };
  }

  available(userId: string): number {
    return this.state(userId).availableUsdCents;
  }

  /** Draw against the line. Throws if it would exceed the limit. */
  draw(userId: string, usdCents: number): CreditState {
    const s = this.state(userId);
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
