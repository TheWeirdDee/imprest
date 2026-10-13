/**
 * Decisions for transactions whose outcome a client lost (receipt timeout, reload, outage), kept
 * pure so they are unit-tested. A failed lookup is never evidence: only definite answers from the
 * providers move a transaction out of "unknown", and only the user can release a hash.
 */

/** A provider lookup: answered (found, or a definite not-found) or failed. */
export type LookupResult<T> = { ok: true; value: T | null } | { ok: false; error: string };

export interface ReceiptLike {
  status: "success" | "reverted";
  blockNumber: bigint;
}

export type PendingDecision =
  | { kind: "failed"; blockNumber: bigint }
  | { kind: "mined"; blockNumber: bigint }
  | { kind: "single-provider"; blockNumber: bigint; which: "primary" | "second" }
  | { kind: "lookup-failed"; error: string }
  | { kind: "check-pending" };

/** Step 1: what the two receipt lookups establish. */
export function decideFromReceipts(primary: LookupResult<ReceiptLike>, second: LookupResult<ReceiptLike>): PendingDecision {
  const pr = primary.ok ? primary.value : null;
  const sr = second.ok ? second.value : null;
  const found = pr ?? sr;
  if (found) {
    if (found.status === "reverted") return { kind: "failed", blockNumber: found.blockNumber };
    if (pr && sr && pr.status === "success" && sr.status === "success" && pr.blockNumber === sr.blockNumber) return { kind: "mined", blockNumber: pr.blockNumber };
    return { kind: "single-provider", blockNumber: found.blockNumber, which: pr ? "primary" : "second" };
  }
  if (!primary.ok) return { kind: "lookup-failed", error: primary.error };
  if (!second.ok) return { kind: "lookup-failed", error: second.error };
  return { kind: "check-pending" };
}

/**
 * Step 2, when neither provider has a receipt: may the user release the hash? Only when BOTH
 * providers definitely answer "transaction not found" and the hash is older than `afterMs`.
 * Nothing is ever released automatically; this only enables the user's explicit release.
 */
export function releasable(primaryTx: LookupResult<unknown>, secondTx: LookupResult<unknown>, ageMs: number, afterMs = 10 * 60_000): boolean {
  return primaryTx.ok && secondTx.ok && primaryTx.value === null && secondTx.value === null && ageMs > afterMs;
}

/** A synchronous one-at-a-time gate: acquire before the first await, release in finally. */
export class SendGate {
  private busy = false;
  tryAcquire(): boolean {
    if (this.busy) return false;
    this.busy = true;
    return true;
  }
  release(): void {
    this.busy = false;
  }
  get held(): boolean {
    return this.busy;
  }
}
