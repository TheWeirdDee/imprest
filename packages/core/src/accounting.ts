/**
 * Deterministic accounting library (directive Phase 12). Same rules as
 * contracts/src/libraries/SettlementMath.sol; used for UI previews and service checks.
 * The Python reference model (proof/reference_model) is the independent implementation
 * that scores both. All amounts are AUSD base units (6 decimals).
 */
export const BPS = 10_000n;
export const PPM = 1_000_000n;
export const DAY = 86_400n;

export interface Waterfall {
  principalRepaid: bigint;
  principalLoss: bigint;
  keeperPaid: bigint;
  feesCollected: bigint;
  feesWrittenOff: bigint;
  traderRemainder: bigint;
}

const min = (a: bigint, b: bigint) => (a < b ? a : b);

/** PRD v3 breach / fee-cap / voluntary-close waterfall (bounty = 0 for voluntary close). */
export function waterfall(equity: bigint, borrowed: bigint, feeOutstanding: bigint, bounty: bigint): Waterfall {
  const e = equity < 0n ? 0n : equity;
  const principalRepaid = min(e, borrowed);
  const principalLoss = borrowed - principalRepaid;
  const residual = e - principalRepaid;
  const keeperPaid = min(bounty, residual);
  const afterKeeper = residual - keeperPaid;
  const feesCollected = min(feeOutstanding, afterKeeper);
  return {
    principalRepaid,
    principalLoss,
    keeperPaid,
    feesCollected,
    feesWrittenOff: feeOutstanding - feesCollected,
    traderRemainder: afterKeeper - feesCollected,
  };
}

export interface ClaimSplit {
  gross: bigint;
  feesPaid: bigint;
  traderShare: bigint;
  protocolShare: bigint;
  poolShare: bigint;
}

/** Flat-only claim: fees netted first, remainder split; pool takes rounding dust. */
export function claimSplit(
  flatEquity: bigint,
  hwm: bigint,
  feeOutstanding: bigint,
  traderBps: bigint,
  protocolBps: bigint,
): ClaimSplit {
  if (flatEquity <= hwm) return { gross: 0n, feesPaid: 0n, traderShare: 0n, protocolShare: 0n, poolShare: 0n };
  const gross = flatEquity - hwm;
  const feesPaid = min(feeOutstanding, gross);
  const net = gross - feesPaid;
  const traderShare = (net * traderBps) / BPS;
  const protocolShare = (net * protocolBps) / BPS;
  return { gross, feesPaid, traderShare, protocolShare, poolShare: net - traderShare - protocolShare };
}

/** Position-use fee accrual with remainder carry and a hard cap. */
export function accrue(
  borrowed: bigint,
  ratePpmPerDay: bigint,
  elapsed: bigint,
  remainder: bigint,
  outstanding: bigint,
  cap: bigint,
): { added: bigint; remainder: bigint } {
  if (outstanding >= cap) return { added: 0n, remainder: 0n };
  const num = borrowed * ratePpmPerDay * elapsed + remainder;
  const den = PPM * DAY;
  let added = num / den;
  let rem = num % den;
  if (outstanding + added >= cap) {
    added = cap - outstanding;
    rem = 0n;
  }
  return { added, remainder: rem };
}

/** Sum of actual transfers in a settlement must equal recoverable equity. */
export function reconciles(w: Waterfall, equity: bigint): boolean {
  const e = equity < 0n ? 0n : equity;
  return w.principalRepaid + w.keeperPaid + w.feesCollected + w.traderRemainder === e;
}
