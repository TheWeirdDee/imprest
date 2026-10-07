import { INT256_MIN, type CohortPolicy, type RiskState } from "@imprest/core";

export type KeeperAction =
  | { kind: "none"; reason: string }
  | { kind: "enforce"; reason: "trading_floor" | "daily_loss" | "fee_cap" | "continue_enforcement" }
  | { kind: "graduate"; toTier: number }
  | { kind: "checkpoint"; reason: string };

export interface DecideOptions {
  graduate: boolean;
  checkpointAfterSec: number;
  nowSec: number;
  lastAccrualTs: bigint;
}

/**
 * Proposes at most one action for a desk from a direct chain read. It is NOT authoritative:
 * the caller simulates the call and the Desk contract alone decides whether it succeeds.
 * A healthy, below-fee-cap desk never gets an enforce proposal; a closed desk gets nothing.
 */
export function decide(r: RiskState, p: CohortPolicy | null, o: DecideOptions): KeeperAction {
  if (r.status === 2) return { kind: "none", reason: "closed" };
  if (r.status === 1) return { kind: "enforce", reason: "continue_enforcement" };
  if (!r.markValid) return { kind: "none", reason: "mark stale: enforce waits for a valid mark" };
  if (r.equity < r.floor) return { kind: "enforce", reason: "trading_floor" };
  if (r.dailyFloor !== INT256_MIN && r.equity < r.dailyFloor) return { kind: "enforce", reason: "daily_loss" };
  if (r.feeCap > 0n && r.feeOutstanding >= r.feeCap) return { kind: "enforce", reason: "fee_cap" };
  if (o.graduate && p && r.flat && r.tier + 1 < p.tierCount && r.feeOutstanding === 0n) {
    const t = p.tiers[r.tier + 1]!;
    const gainOk = r.equity * 10_000n >= r.startEquity * BigInt(10_000 + t.gradProfitBps);
    const tradesOk = r.closedTradesThisTier >= BigInt(t.gradMinClosedTrades);
    const timeOk = BigInt(o.nowSec) - r.tierStartTs >= BigInt(t.gradMinSeconds);
    const claimsOk = r.claimsThisTier >= BigInt(t.gradMinClaims);
    if (gainOk && tradesOk && timeOk && claimsOk) return { kind: "graduate", toTier: r.tier + 1 };
  }
  if (r.exposed && r.borrowed > 0n && BigInt(o.nowSec) - o.lastAccrualTs >= BigInt(o.checkpointAfterSec)) {
    return { kind: "checkpoint", reason: "refresh fee accrual and exposure flag" };
  }
  return { kind: "none", reason: "healthy" };
}
