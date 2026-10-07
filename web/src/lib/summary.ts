import { INT256_MIN, TIER_NAMES, accounting, type CohortPolicy, type RiskState } from "@imprest/core";
import type { PositionView } from "./desk";

/** Display-only derived numbers. All inputs are chain reads; nothing here authorizes. */
export function summarize(r: RiskState, p: CohortPolicy | null, positions: PositionView[] | null) {
  const open = (positions ?? []).filter((x) => x.lots > 0n);
  const unrealized = open.reduce((a, x) => a + x.deltaPnlCNS + x.premiumPnlCNS, 0n);
  const realizedEquity = r.equity - unrealized;
  const realized = realizedEquity - r.startEquity;
  const deposits = open.reduce((a, x) => a + x.depositCNS, 0n);
  const available = r.equity - unrealized - deposits;
  const t = p?.tiers[r.tier];
  const claimable =
    r.flat && t ? accounting.claimSplit(r.equity, r.hwm, r.feeOutstanding, BigInt(t.traderSplitBps), BigInt(t.protocolSplitBps)) : null;
  return {
    tierName: TIER_NAMES[r.tier] ?? `Tier ${r.tier}`,
    unrealized,
    realized,
    available,
    usedCredit: r.borrowed,
    deskSize: r.originalStake + r.borrowed,
    riskBuffer: r.equity - r.floor,
    dailyRemaining: r.dailyFloor === INT256_MIN ? null : r.equity - r.dailyFloor,
    feeCapRemaining: r.feeCap - r.feeOutstanding,
    economicEquity: r.equity - r.feeOutstanding,
    claimable,
    openPositions: open.length,
  };
}
