/**
 * Pure versions of the money previews the website shows (LP exposure, claim preview, maximum new
 * order, close messages), so each rule is unit-tested instead of living only inside a component.
 */
import { claimSplit, type ClaimSplit } from "./accounting";

/** Desk status as stored onchain: 0 Active, 1 Enforcing, 2 Closed. */
export interface DeskExposureInput {
  status: number;
  borrowed: bigint;
  equity: bigint;
  originalStake: bigint;
  feeOutstanding: bigint;
}

export interface LpExposure {
  active: number;
  enforcing: number;
  /** Unsettled (active or enforcing) desks holding pool credit. */
  funded: number;
  stakes: bigint;
  feeLiabilities: bigint;
  /** Borrowed minus equity, summed over unsettled funded desks: the shortfall right now. */
  principalAtRisk: bigint;
}

/** An enforcing desk still owes the pool until it settles, so it counts in every exposure total. */
export function lpExposure(desks: DeskExposureInput[]): LpExposure {
  const unsettled = desks.filter((d) => d.status === 0 || d.status === 1);
  const funded = unsettled.filter((d) => d.borrowed > 0n);
  return {
    active: desks.filter((d) => d.status === 0).length,
    enforcing: desks.filter((d) => d.status === 1).length,
    funded: funded.length,
    stakes: unsettled.reduce((a, d) => a + d.originalStake, 0n),
    feeLiabilities: unsettled.reduce((a, d) => a + d.feeOutstanding, 0n),
    principalAtRisk: funded.reduce((a, d) => {
      const shortfall = d.borrowed - (d.equity > 0n ? d.equity : 0n);
      return a + (shortfall > 0n ? shortfall : 0n);
    }, 0n),
  };
}

export interface ClaimPreview {
  split: ClaimSplit;
  claimable: boolean;
  message: string;
}

/**
 * Claim preview from REALIZED equity (equity minus unrealized PnL). Claimable only when the desk is
 * active, flat and realized equity is above the high-water mark, the same checks as Desk.claim().
 */
export function claimPreview(
  r: { status: number; flat: boolean; equity: bigint; hwm: bigint; feeOutstanding: bigint },
  unrealized: bigint,
  traderSplitBps: number,
  protocolSplitBps: number,
): ClaimPreview {
  const split = claimSplit(r.equity - unrealized, r.hwm, r.feeOutstanding, BigInt(traderSplitBps), BigInt(protocolSplitBps));
  const claimable = r.status === 0 && r.flat && split.gross > 0n;
  const message = claimable
    ? "Eligible: the desk is active and flat, so the contract will pay the split shown."
    : split.gross > 0n
      ? r.status !== 0
        ? "Realized profit is above the high-water mark, but the desk is not active, so it cannot be claimed."
        : "Realized profit is above the high-water mark, but positions are open: close all positions first. The figures are an estimate until then."
      : "Realized equity is not above the high-water mark.";
  return { split, claimable, message };
}

export interface MaxOrderInput {
  equity: bigint;
  maxLeverageHdths: number;
  /** Notional of the desk's open positions at mark. */
  usedNotional: bigint;
  borrowed: bigint;
  /** Pool limits, required for a funded desk (borrowed > 0); the contract checks them only then. */
  pool?: { deskNotionalCap: bigint; marketCap: bigint; marketGross: bigint; symbol: string };
}

/**
 * Largest new notional the contract would accept, estimated: leverage headroom always; for a funded
 * desk also the pool's per-desk cap and the market's pool-wide cap. Returns the tightest limit and
 * names it. Null when a funded desk's pool limits are not known yet.
 */
export function maxNewOrder(i: MaxOrderInput): { value: bigint; limit: string } | null {
  const limits = [{ v: (i.equity * BigInt(i.maxLeverageHdths)) / 100n - i.usedNotional, why: "leverage" }];
  if (i.borrowed > 0n) {
    if (!i.pool) return null;
    limits.push({ v: i.pool.deskNotionalCap - i.usedNotional, why: "desk cap" });
    limits.push({ v: i.pool.marketCap - i.pool.marketGross, why: `${i.pool.symbol} pool cap` });
  }
  const min = limits.reduce((a, b) => (b.v < a.v ? b : a));
  return { value: min.v > 0n ? min.v : 0n, limit: min.why };
}

/**
 * Message after one market's position closed. `others` lists positions still open in other markets
 * ("ETH long"), or null when they could not be read; the desk is called flat only when none remain.
 */
export function closedMarketMessage(symbol: string, others: string[] | null): string {
  const rest =
    others === null
      ? "Other markets could not be checked just now; see Positions before claiming."
      : others.length === 0
        ? "No other position is open, so the desk is flat."
        : `Still open: ${others.join(", ")}. The desk is not flat until those are closed.`;
  return `Your ${symbol} position is closed. ${rest} The form has been reset.`;
}
