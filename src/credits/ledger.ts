import { config } from "../config.js";

/**
 * Prepaid credits ledger — USD-denominated, non-custodial AI billing. The user
 * buys credits (card/USDC), the agent's reasoning step burns them at a markup.
 * On-chain merchant payments stay OUTSIDE this ledger (user's own wallet), so
 * Leash never holds value destined for third parties — the deliberate
 * non-custodial choice that avoids money-transmitter exposure.
 *
 * Default impl is in-memory for the demo. Swap for Postgres/Stripe-backed in
 * production by implementing this same interface — nothing else changes.
 */
export interface CreditsLedger {
  readonly enabled: boolean;
  /** Balance in USD cents. */
  getBalanceUsdCents(userId: string): Promise<number>;
  /** Returns the new balance. Throws if insufficient (when enabled). */
  debit(userId: string, usdCents: number, reason: string): Promise<number>;
  credit(userId: string, usdCents: number, reason: string): Promise<number>;
}

class InMemoryCreditsLedger implements CreditsLedger {
  readonly enabled = config.credits.enabled;
  private balances = new Map<string, number>();

  private seed(userId: string): number {
    if (!this.balances.has(userId)) this.balances.set(userId, config.credits.seedUsdCents);
    return this.balances.get(userId) as number;
  }

  async getBalanceUsdCents(userId: string): Promise<number> {
    return this.seed(userId);
  }

  async debit(userId: string, usdCents: number, _reason: string): Promise<number> {
    if (!this.enabled) return this.seed(userId); // BYOK mode: no metering
    const bal = this.seed(userId);
    if (usdCents > bal) {
      throw new Error(`insufficient credits: need ${usdCents}¢, have ${bal}¢`);
    }
    const next = bal - usdCents;
    this.balances.set(userId, next);
    return next;
  }

  async credit(userId: string, usdCents: number, _reason: string): Promise<number> {
    const next = this.seed(userId) + usdCents;
    this.balances.set(userId, next);
    return next;
  }
}

let cached: CreditsLedger | null = null;
export function getCredits(): CreditsLedger {
  if (!cached) cached = new InMemoryCreditsLedger();
  return cached;
}

/** Convert a USD-cents amount to whole credits for display. */
export function centsToCredits(usdCents: number): number {
  return Math.round(usdCents / config.credits.usdCentsPerCredit);
}
