import { describe, expect, it } from "vitest";
import { encodeErrorResult as encErr, recoverTypedDataAddress } from "viem";
import { privateKeyToAccount as pk } from "viem/accounts";
import {
  accounting,
  checkPolicy,
  compareReadback,
  crossCheck,
  decodeRevert,
  deskAbi,
  deskDomain,
  formatUnitsFixed,
  fromWire,
  getNetwork,
  INT256_MIN,
  notional,
  parseUnitsStrict,
  riskLevel,
  toWire,
  tradeIntentTypes,
  transition,
  validateClaim,
  type ActionState,
  type Claim,
  type CohortPolicy,
  type RiskState,
} from "../src";

describe("networks", () => {
  it("resolves testnet from the single config and refuses unknown envs", () => {
    const t = getNetwork("testnet");
    expect(t.chainId).toBe(10143);
    expect(t.label).toBe("TESTNET");
    expect(t.perpl.collateralSymbol).toBe("AUSD");
    expect(t.rpcUrls.length).toBeGreaterThanOrEqual(2);
    expect(t.rpcUrls[0]).not.toBe(t.rpcUrls[1]);
    expect(() => getNetwork("prod")).toThrow();
    expect(() => getNetwork(undefined)).toThrow();
  });
  it("has no Imprest addresses until a deployment receipt exists", () => {
    expect(getNetwork("mainnet").imprest.pool).toBeNull();
  });
});

describe("units", () => {
  it("formats without float error and parses strictly", () => {
    expect(formatUnitsFixed(1234567891n, 6, 2)).toBe("1,234.57");
    expect(formatUnitsFixed(-5n, 6, 6)).toBe("-0.000005");
    expect(parseUnitsStrict("20.5", 6)).toBe(20_500_000n);
    expect(() => parseUnitsStrict("1e3", 6)).toThrow();
    expect(() => parseUnitsStrict("1.0000001", 6)).toThrow();
  });
  it("computes notional identically to Desk._notional", () => {
    const btc = { symbol: "BTC", perpId: 16, priceDecimals: 1, lotDecimals: 5 };
    expect(notional(btc, 1_000n, 1_000_000n)).toBe(1_000_000_000n); // 0.01 BTC @ 100k = 1,000 AUSD
    const eth = { symbol: "ETH", perpId: 32, priceDecimals: 2, lotDecimals: 3 };
    expect(notional(eth, 25n, 400_000n)).toBe(100_000_000n); // 0.025 ETH @ 4,000 = 100 AUSD
  });
});

describe("accounting mirrors the PRD examples", () => {
  it("waterfall: exact 6 AUSD trading loss at Tier 1 with capped fees", () => {
    const w = accounting.waterfall(94_000_000n, 80_000_000n, 5_000_000n, 500_000n);
    expect(w).toEqual({
      principalRepaid: 80_000_000n,
      principalLoss: 0n,
      keeperPaid: 500_000n,
      feesCollected: 5_000_000n,
      feesWrittenOff: 0n,
      traderRemainder: 8_500_000n,
    });
    expect(accounting.reconciles(w, 94_000_000n)).toBe(true);
  });
  it("claim split: 10 realized, 1.20 fee -> 7.04 / 1.32 / 0.44", () => {
    const c = accounting.claimSplit(110_000_000n, 100_000_000n, 1_200_000n, 8_000n, 500n);
    expect(c.traderShare).toBe(7_040_000n);
    expect(c.poolShare).toBe(1_320_000n);
    expect(c.protocolShare).toBe(440_000n);
  });
  it("accrual: 0.05%/day on 80 AUSD for 30 days = 1.20", () => {
    expect(accounting.accrue(80_000_000n, 500n, 30n * 86_400n, 0n, 0n, 5_000_000n).added).toBe(1_200_000n);
  });
});

describe("verification state machine", () => {
  const tx = ("0x" + "ab".repeat(32)) as `0x${string}`;
  const run = (events: Parameters<typeof transition>[1][]) =>
    events.reduce<ActionState>((s, e) => transition(s, e), { kind: "idle" });

  it("a receipt alone is confirming, never verified", () => {
    const s = run([
      { type: "request", label: "claim" },
      { type: "submitted", txHash: tx },
      { type: "receipt", status: "success", blockNumber: 10n },
    ]);
    expect(s.kind).toBe("confirming");
  });

  it("forced mismatch fixture ends in verification_failed", () => {
    const expected = { traderBalance: "107040000" };
    const observed = { traderBalance: "100000000" }; // the second RPC disagrees
    const cmp = compareReadback(expected, observed);
    expect(cmp.ok).toBe(false);
    const s = run([
      { type: "request", label: "claim" },
      { type: "submitted", txHash: tx },
      { type: "receipt", status: "success", blockNumber: 10n },
      { type: "readback", ok: cmp.ok, reason: cmp.reason, evidence: { rpc: "verify", blockNumber: "11", expected, observed } },
    ]);
    expect(s.kind).toBe("verification_failed");
  });

  it("agreement on the independent RPC is the only path to verified", () => {
    const expected = { traderBalance: "107040000" };
    const cmp = compareReadback(expected, { ...expected });
    const s = run([
      { type: "request", label: "claim" },
      { type: "submitted", txHash: tx },
      { type: "receipt", status: "success", blockNumber: 10n },
      { type: "readback", ok: cmp.ok, evidence: { rpc: "verify", blockNumber: "11", expected, observed: expected } },
    ]);
    expect(s.kind).toBe("verified");
  });

  it("readback cannot jump straight from submitted to verified", () => {
    const s = run([
      { type: "request", label: "x" },
      { type: "submitted", txHash: tx },
      { type: "readback", ok: true, evidence: { rpc: "v", blockNumber: "1", expected: {}, observed: {} } },
    ]);
    expect(s.kind).toBe("submitted");
  });

  it("an empty expectation is never treated as agreement", () => {
    expect(compareReadback({}, { a: "1" }).ok).toBe(false);
  });

  it("reverted receipt is failed", () => {
    const s = run([
      { type: "request", label: "x" },
      { type: "submitted", txHash: tx },
      { type: "receipt", status: "reverted", blockNumber: 3n },
    ]);
    expect(s.kind).toBe("failed");
  });
});

describe("errors", () => {
  it("decodes the desk's named leverage error into plain language", () => {
    const data = encErr({ abi: deskAbi as any, errorName: "LeverageExceeded", args: [600n, 500n] });
    const e = decodeRevert(data);
    expect(e.code).toBe("LEVERAGE_EXCEEDED");
    expect(e.message).toContain("6.00x");
    expect(e.message).toContain("5.00x");
  });
});

describe("EIP-712 intents", () => {
  it("round-trips the wire format and recovers the trader", async () => {
    const acct = pk("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const desk = "0x00000000000000000000000000000000000000d1" as const;
    const order = { perpId: 16n, side: 0 as const, priceLimit: 1_001_000n, lots: 100n, leverage: 500n, reduceOnly: false, fillOrKill: false };
    const sig = await acct.signTypedData({
      domain: deskDomain(10143, desk),
      types: tradeIntentTypes,
      primaryType: "TradeIntent",
      message: { ...order, nonce: 1n, deadline: 99n },
    });
    const w = toWire(10143, desk, order, 1n, 99n, sig);
    const back = fromWire(JSON.parse(JSON.stringify(w)));
    expect(back.order).toEqual(order);
    const rec = await recoverTypedDataAddress({
      domain: deskDomain(10143, desk),
      types: tradeIntentTypes,
      primaryType: "TradeIntent",
      message: { ...back.order, nonce: back.nonce, deadline: back.deadline },
      signature: sig,
    });
    expect(rec).toBe(acct.address);
  });
  it("rejects malformed wire intents", () => {
    expect(() => fromWire({ order: { side: 2 } } as any)).toThrow();
    expect(() =>
      fromWire({ chainId: 1, desk: "0x0", nonce: "1", deadline: "1", signature: "0x00", order: { perpId: "1", side: 0, priceLimit: "1", lots: "1", leverage: "1", reduceOnly: false, fillOrKill: false } } as any),
    ).toThrow();
  });
});

describe("frontend policy check (validation only)", () => {
  const policy: CohortPolicy = {
    name: "demo-v0",
    demo: true,
    minStake: 20_000_000n,
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
    tiers: [],
    markets: [{ perpId: 16n, priceDecimals: 1, lotDecimals: 5 }],
  };
  const risk = {
    status: 0, tier: 0, enforceReason: 0, equity: 100_000_000n, markValid: true, flat: true,
    startEquity: 100_000_000n, floor: 94_000_000n, dailyFloor: INT256_MIN, dayStartEquity: 0n,
    hwm: 100_000_000n, originalStake: 100_000_000n, borrowed: 0n, feeOutstanding: 0n, feeCap: 25_000_000n,
    feeAccrued: 0n, feeCollected: 0n, feeWrittenOff: 0n, closedTradesThisTier: 0n, claimsThisTier: 0n,
    tierStartTs: 0n, lastNonce: 0n, accountId: 1n, exposed: false,
  } satisfies RiskState;

  it("blocks 6x with an explicit reason", () => {
    const r = checkPolicy({
      order: { perpId: 16n, side: 0, priceLimit: 1_000_000n, lots: 10n, leverage: 600n, reduceOnly: false, fillOrKill: false },
      policy, risk, markPns: 1_000_000n, markValid: true, positionLots: 0n, positionIsLong: null,
    });
    expect(r.ok).toBe(false);
    const lev = r.checks.find((c) => c.rule === "Leverage")!;
    expect(lev.status).toBe("blocked");
    expect(lev.detail).toContain("6.00x");
  });
  it("passes an in-policy order", () => {
    const r = checkPolicy({
      order: { perpId: 16n, side: 0, priceLimit: 1_002_000n, lots: 10n, leverage: 500n, reduceOnly: false, fillOrKill: false },
      policy, risk, markPns: 1_000_000n, markValid: true, positionLots: 0n, positionIsLong: null,
    });
    expect(r.ok).toBe(true);
  });
  it("risk level reads breach below floor", () => {
    expect(riskLevel({ ...risk, equity: 93_000_000n })).toBe("breach");
    expect(riskLevel({ ...risk, equity: 95_000_000n })).toBe("warning");
    expect(riskLevel(risk)).toBe("safe");
  });
});

describe("evidence rules", () => {
  const base: Claim = {
    claim_id: "X", statement: "s", value: null, unit: null, network: "Monad Testnet", chain_id: 10143,
    contract: null, source: "s", evidence: [], transaction_hash: null, block_number: null,
    timestamp_utc: "2026-10-07T12:00:00Z", status: "PENDING", methodology: "m", sample_size: null, denominator: null,
  };
  const exists = () => true;
  it("accepts an honest PENDING claim", () => {
    expect(validateClaim(base, "f", exists)).toEqual([]);
  });
  it("rejects a PENDING claim that carries a value", () => {
    expect(validateClaim({ ...base, value: 0 }, "f", exists).map((x) => x.rule)).toContain("pending");
  });
  it("rejects MAINNET_VERIFIED backed only by testnet evidence", () => {
    const c: Claim = { ...base, status: "MAINNET_VERIFIED", value: 1, chain_id: 10143, evidence: ["proof/receipts/testnet/a.json"], transaction_hash: "0x" + "1".repeat(64) };
    const rules = validateClaim(c, "f", exists).map((x) => x.rule);
    expect(rules).toContain("mainnet");
  });
  it("rejects malformed hashes and verified claims without a tx", () => {
    const c: Claim = { ...base, status: "TESTNET_VERIFIED", value: 1, evidence: ["proof/receipts/testnet/a.json"], transaction_hash: "0x1234" };
    expect(validateClaim(c, "f", exists).map((x) => x.rule)).toContain("tx");
    const d: Claim = { ...c, transaction_hash: null };
    expect(validateClaim(d, "f", exists).map((x) => x.rule)).toContain("tx-required");
  });
  it("flags duplicate claims that disagree", () => {
    const f = crossCheck([
      { file: "a", claim: { ...base, value: null } },
      { file: "b", claim: { ...base, status: "TARGET", value: 5 } },
    ]);
    expect(f).toHaveLength(1);
  });
});
