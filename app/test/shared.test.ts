import { test } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { bytesToHex } from "viem";
import { deriveEvmKey, getNetwork, checkPolicy, INT256_MIN, toCohortPolicy } from "../../packages/core/src/index";

test("one passkey PRF output derives the same account on web and mobile (shared core)", () => {
  const prf = new Uint8Array(32).map((_, i) => i + 1);
  const a = privateKeyToAccount(bytesToHex(deriveEvmKey(new Uint8Array(prf))));
  const b = privateKeyToAccount(bytesToHex(deriveEvmKey(new Uint8Array(prf))));
  assert.equal(a.address, b.address);
  const other = privateKeyToAccount(bytesToHex(deriveEvmKey(new Uint8Array(32).fill(9))));
  assert.notEqual(a.address, other.address);
});

test("mobile reads the same network config and deployment as web", () => {
  const n = getNetwork("testnet");
  assert.equal(n.chainId, 10143);
  assert.equal(n.imprest.factory?.toLowerCase(), "0x1569ee4a7210e226db932b5b7633e63d3ac8c544");
  assert.equal(n.imprest.pool?.toLowerCase(), "0x85ffff6b1e8e62d2ce8aca45b69ae530c6fbf457");
});

test("mobile order screen uses the shared policy check (6x blocked)", () => {
  const policy = toCohortPolicy({
    name: "0x64656d6f2d763000000000000000000000000000000000000000000000000000",
    demo: true, minStake: 100_000_000n, maxDrawdownBps: 600, dailyLossBps: 300, maxLeverageHdths: 500, priceBandBps: 50,
    maxNegPnlBps: 50, execBlockWindow: 2, enforceSliceBandBps: 100, feeCapBps: 2500, keeperBounty: 500_000n, tierCount: 2,
    tiers: [{ sizeMultiple: 1, feeRatePpmPerDay: 0, traderSplitBps: 10000, protocolSplitBps: 0, gradProfitBps: 0, gradMinClosedTrades: 0, gradMinSeconds: 0, gradMinClaims: 0 }],
    markets: [{ perpId: 16n, priceDecimals: 1, lotDecimals: 5 }],
  });
  assert.equal(policy.name, "demo-v0");
  const risk = {
    status: 0, tier: 0, enforceReason: 0, equity: 100_000_000n, markValid: true, flat: true, startEquity: 100_000_000n,
    floor: 94_000_000n, dailyFloor: INT256_MIN, dayStartEquity: 0n, hwm: 100_000_000n, originalStake: 100_000_000n, borrowed: 0n,
    feeOutstanding: 0n, feeCap: 25_000_000n, feeAccrued: 0n, feeCollected: 0n, feeWrittenOff: 0n, closedTradesThisTier: 0n,
    claimsThisTier: 0n, tierStartTs: 0n, lastNonce: 0n, accountId: 1n, exposed: false,
  };
  const r = checkPolicy({ order: { perpId: 16n, side: 0, priceLimit: 1_000_000n, lots: 100n, leverage: 600n, reduceOnly: false, fillOrKill: false }, policy, risk, markPns: 1_000_000n, markValid: true, positionLots: 0n, positionIsLong: null });
  assert.equal(r.ok, false);
});
