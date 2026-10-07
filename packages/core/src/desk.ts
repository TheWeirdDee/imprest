/** Shape of Desk.riskState(); read for display only, never to authorize. */
export interface RiskState {
  status: number; // 0 Active, 1 Enforcing, 2 Closed
  tier: number;
  enforceReason: number; // 0 None, 1 TradingFloor, 2 DailyLoss, 3 FeeCap
  equity: bigint;
  markValid: boolean;
  flat: boolean;
  startEquity: bigint;
  floor: bigint;
  dailyFloor: bigint; // int256 min when no trade yet today
  dayStartEquity: bigint;
  hwm: bigint;
  originalStake: bigint;
  borrowed: bigint;
  feeOutstanding: bigint;
  feeCap: bigint;
  feeAccrued: bigint;
  feeCollected: bigint;
  feeWrittenOff: bigint;
  closedTradesThisTier: bigint;
  claimsThisTier: bigint;
  tierStartTs: bigint;
  lastNonce: bigint;
  accountId: bigint;
  exposed: boolean;
}

export const INT256_MIN = -(2n ** 255n);

export const DESK_STATUS = ["Active", "Enforcing", "Closed"] as const;
export const ENFORCE_REASON = ["None", "Trading floor", "Daily loss", "Fee cap"] as const;
export const TIER_NAMES = ["Evaluation", "Funded", "Proven"] as const;

export interface TierParams {
  sizeMultiple: number;
  feeRatePpmPerDay: number;
  traderSplitBps: number;
  protocolSplitBps: number;
  gradProfitBps: number;
  gradMinClosedTrades: number;
  gradMinSeconds: number;
  gradMinClaims: number;
}

export interface CohortPolicy {
  name: string;
  demo: boolean;
  minStake: bigint;
  maxDrawdownBps: number;
  dailyLossBps: number;
  maxLeverageHdths: number;
  priceBandBps: number;
  maxNegPnlBps: number;
  execBlockWindow: number;
  enforceSliceBandBps: number;
  feeCapBps: number;
  keeperBounty: bigint;
  tierCount: number;
  tiers: TierParams[];
  markets: { perpId: bigint; priceDecimals: number; lotDecimals: number }[];
}

/** Converts the raw tuple returned by Desk.policy() / DeskFactory.getCohort(). */
export function toCohortPolicy(raw: any): CohortPolicy {
  const nameHex: string = raw.name;
  let name = "";
  for (let i = 2; i < nameHex.length; i += 2) {
    const code = parseInt(nameHex.slice(i, i + 2), 16);
    if (code === 0) break;
    name += String.fromCharCode(code);
  }
  return {
    name,
    demo: raw.demo,
    minStake: raw.minStake,
    maxDrawdownBps: Number(raw.maxDrawdownBps),
    dailyLossBps: Number(raw.dailyLossBps),
    maxLeverageHdths: Number(raw.maxLeverageHdths),
    priceBandBps: Number(raw.priceBandBps),
    maxNegPnlBps: Number(raw.maxNegPnlBps),
    execBlockWindow: Number(raw.execBlockWindow),
    enforceSliceBandBps: Number(raw.enforceSliceBandBps),
    feeCapBps: Number(raw.feeCapBps),
    keeperBounty: raw.keeperBounty,
    tierCount: Number(raw.tierCount),
    tiers: (raw.tiers as any[]).slice(0, Number(raw.tierCount)).map((t) => ({
      sizeMultiple: Number(t.sizeMultiple),
      feeRatePpmPerDay: Number(t.feeRatePpmPerDay),
      traderSplitBps: Number(t.traderSplitBps),
      protocolSplitBps: Number(t.protocolSplitBps),
      gradProfitBps: Number(t.gradProfitBps),
      gradMinClosedTrades: Number(t.gradMinClosedTrades),
      gradMinSeconds: Number(t.gradMinSeconds),
      gradMinClaims: Number(t.gradMinClaims),
    })),
    markets: (raw.markets as any[]).map((m) => ({
      perpId: m.perpId,
      priceDecimals: Number(m.priceDecimals),
      lotDecimals: Number(m.lotDecimals),
    })),
  };
}

/** Distance to floor in base units and as a fraction of the floor buffer. */
export function floorDistance(r: Pick<RiskState, "equity" | "floor" | "startEquity">) {
  const distance = r.equity - r.floor;
  const buffer = r.startEquity - r.floor;
  const ratio = buffer > 0n ? Number(distance) / Number(buffer) : 0;
  return { distance, ratio: Math.max(-1, Math.min(1.5, ratio)) };
}

export type RiskLevel = "safe" | "warning" | "breach";

export function riskLevel(r: Pick<RiskState, "equity" | "floor" | "startEquity" | "dailyFloor">): RiskLevel {
  if (r.equity < r.floor) return "breach";
  if (r.dailyFloor !== INT256_MIN && r.equity < r.dailyFloor) return "breach";
  const { ratio } = floorDistance(r);
  return ratio < 0.35 ? "warning" : "safe";
}
