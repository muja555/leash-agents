import { randomUUID } from "node:crypto";

/**
 * In-flight run controls shared between the SSE task handler and the agent loop:
 *  - the kill switch (server-side `halted` flag the policy engine reads), and
 *  - the pending human-approval registry (gate 6 made tactile).
 *
 * Single-process, in-memory — fine for the demo. M4+/multi-user would key these
 * by session and move them to a shared store.
 */

let halted = false;
export function isHalted(): boolean {
  return halted;
}
export function setHalted(v: boolean): void {
  halted = v;
}

const APPROVAL_TIMEOUT_MS = 120_000; // auto-deny after 2 min so streams never hang
const pending = new Map<string, (decision: "approve" | "deny") => void>();

/** Open a human-approval request; resolves when the UI responds (or times out → deny). */
export function createApproval(): { id: string; wait: Promise<"approve" | "deny"> } {
  const id = randomUUID();
  let resolver!: (decision: "approve" | "deny") => void;
  const wait = new Promise<"approve" | "deny">((resolve) => {
    resolver = (d) => {
      pending.delete(id);
      resolve(d);
    };
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve("deny");
      }
    }, APPROVAL_TIMEOUT_MS);
  });
  pending.set(id, resolver);
  return { id, wait };
}

/** Resolve a pending approval from the UI. Returns false if the id is unknown/expired. */
export function resolveApproval(id: string, decision: "approve" | "deny"): boolean {
  const r = pending.get(id);
  if (!r) return false;
  r(decision);
  return true;
}
