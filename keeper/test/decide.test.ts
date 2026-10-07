import { describe, expect, it } from "vitest";
import { INT256_MIN, type CohortPolicy, type RiskState } from "@imprest/core";
import { decide } from "../src/decide";

const policy: CohortPolicy = {
  name: "demo-v0",
  demo: true,
  minStake: 100_000_000n,
  maxDrawdownBps: 600,
  dailyLossBps: 300,
  maxLeverageHdths: 500,
  priceBandBps: 50,
  maxNegPnlBps: 50,
  execBlockWindow: 2,
  enforceSliceBandBps: 100,
  feeCapBps: 2500,
  keeperBounty: 500_000n,
  tierCount: 2,
  tiers: [
    { sizeMultiple: 1, feeRatePpmPerDay: 0, traderSplitBps: 10000, protocolSplitBps: 0, gradProfitBps: 0, gradMinClosedTrades: 0, gradMinSeconds: 0, gradMinClaims: 0 },
    { sizeMultiple: 5, feeRatePpmPerDay: 500, traderSplitBps: 8000, protocolSplitBps: 500, gradProfitBps: 200, gradMinClosedTrades: 2, gradMinSeconds: 0, gradMinClaims: 0 },
  ],
  markets: [],
};

const healthy: RiskState = {
  status: 0, tier: 1, enforceReason: 0, equity: 500_000_000n, markValid: true, flat: false, startEquity: 500_000_000n,
  floor: 470_000_000n, dailyFloor: INT256_MIN, dayStartEquity: 0n, hwm: 500_000_000n, originalStake: 100_000_000n,
  borrowed: 400_000_000n, feeOutstanding: 0n, feeCap: 25_000_000n, feeAccrued: 0n, feeCollected: 0n, feeWrittenOff: 0n,
  closedTradesThisTier: 0n, claimsThisTier: 0n, tierStartTs: 0n, lastNonce: 0n, accountId: 1n, exposed: true,
};
const opts = { graduate: true, checkpointAfterSec: 21_600, nowSec: 1_000, lastAccrualTs: 900n };

describe("keeper decision (observes; the contract decides)", () => {
  it("healthy desk: no enforce", () => {
    expect(decide(healthy, policy, opts).kind).toBe("none");
  });
  it("breached desk: enforce for the trading floor", () => {
    expect(decide({ ...healthy, equity: 460_000_000n }, policy, opts)).toEqual({ kind: "enforce", reason: "trading_floor" });
  });
  it("daily loss below the daily floor", () => {
    expect(decide({ ...healthy, equity: 480_000_000n, dailyFloor: 485_000_000n }, policy, opts)).toEqual({ kind: "enforce", reason: "daily_loss" });
  });
  it("fee cap reached: enforce", () => {
    expect(decide({ ...healthy, feeOutstanding: 25_000_000n }, policy, opts)).toEqual({ kind: "enforce", reason: "fee_cap" });
  });
  it("partial close in progress: keeps enforcing until settled", () => {
    expect(decide({ ...healthy, status: 1 }, policy, opts)).toEqual({ kind: "enforce", reason: "continue_enforcement" });
  });
  it("settled desk: never acted on again (no repeated bounty)", () => {
    expect(decide({ ...healthy, status: 2, equity: 0n }, policy, opts).kind).toBe("none");
  });
  it("stale mark: waits instead of enforcing", () => {
    expect(decide({ ...healthy, equity: 0n, markValid: false }, policy, opts).kind).toBe("none");
  });
  it("graduates only when every rule holds", () => {
    const evalDesk = { ...healthy, tier: 0, borrowed: 0n, flat: true, exposed: false, startEquity: 100_000_000n, equity: 102_000_000n, floor: 94_000_000n, closedTradesThisTier: 2n };
    expect(decide(evalDesk, policy, opts)).toEqual({ kind: "graduate", toTier: 1 });
    expect(decide({ ...evalDesk, closedTradesThisTier: 1n }, policy, opts).kind).toBe("none");
    expect(decide({ ...evalDesk, equity: 101_900_000n }, policy, opts).kind).toBe("none");
    expect(decide({ ...evalDesk, flat: false }, policy, opts).kind).toBe("none");
  });
  it("checkpoints stale fee accounting on exposed funded desks", () => {
    expect(decide(healthy, policy, { ...opts, nowSec: 100_000, lastAccrualTs: 0n }).kind).toBe("checkpoint");
  });
});
