import { describe, expect, it } from "vitest";
import { encodeErrorResult as encErr, recoverTypedDataAddress } from "viem";
import { privateKeyToAccount as pk } from "viem/accounts";
import {
  SendGate,
  decideFromReceipts,
  releasable,
  eventMatchesOrder,
  claimPreview,
  closedMarketMessage,
  lpExposure,
  maxNewOrder,
  validateReceipt,
  describeFill,
  signedLots,
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

  it("a receipt timeout after broadcast is unknown, not failed, and can still be confirmed later", () => {
    const pending = run([
      { type: "request", label: "trade" },
      { type: "submitted", txHash: tx },
      { type: "receipt_unavailable", reason: "no receipt after 60 s" },
    ]);
    expect(pending.kind).toBe("unknown");
    expect("txHash" in pending && pending.txHash).toBe(tx);
    const errored = run([
      { type: "request", label: "trade" },
      { type: "submitted", txHash: tx },
      { type: "error", reason: "RPC unavailable" },
    ]);
    expect(errored.kind).toBe("unknown");
    expect(transition(pending, { type: "receipt", status: "success", blockNumber: 12n }).kind).toBe("confirming");
    expect(transition(pending, { type: "receipt", status: "reverted", blockNumber: 12n }).kind).toBe("failed");
    expect(transition(pending, { type: "receipt_unavailable", reason: "still waiting" }).kind).toBe("unknown");
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
    expect(r.unknown).toEqual([]);
  });
  it("an unknown mark is not a PASS: the price band check is unknown and ok is false", () => {
    const r = checkPolicy({
      order: { perpId: 16n, side: 0, priceLimit: 1_002_000n, lots: 10n, leverage: 500n, reduceOnly: false, fillOrKill: false },
      policy, risk, markPns: null, markValid: true, positionLots: 0n, positionIsLong: null,
    });
    expect(r.ok).toBe(false);
    expect(r.unknown.length).toBeGreaterThan(0);
    expect(r.checks.some((c) => c.status === "blocked")).toBe(false);
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

describe("fill from signed positions (reversals are fills)", () => {
  const buy = (lots: bigint) => ({ side: 0, lots });
  const sell = (lots: bigint) => ({ side: 1, lots });
  it("long 100 selling 200 is a 200-lot fill ending short 100, not 'no fill'", () => {
    const f = describeFill(sell(200n), 100n, -100n);
    expect(f).toMatchObject({ filledLots: "200", fill: "full", positionSide: "short", positionLots: "100", direction: "matches order" });
  });
  it("short 100 buying 200 flips to long 100", () => {
    expect(describeFill(buy(200n), -100n, 100n)).toMatchObject({ filledLots: "200", positionSide: "long", direction: "matches order" });
  });
  it("smaller opposite reduction, exact flat close, partial flip and no-fill IOC", () => {
    expect(describeFill(sell(40n), 100n, 60n)).toMatchObject({ filledLots: "40", fill: "full", positionSide: "long" });
    expect(describeFill(sell(100n), 100n, 0n)).toMatchObject({ filledLots: "100", fill: "full", positionSide: "flat", positionLots: "0" });
    expect(describeFill(sell(200n), 100n, -50n)).toMatchObject({ filledLots: "150", fill: "partial", positionSide: "short" });
    expect(describeFill(buy(100n), 0n, 0n)).toMatchObject({ filledLots: "0", fill: "none", positionSide: "flat" });
    expect(describeFill(buy(100n), 0n, 40n)).toMatchObject({ filledLots: "40", fill: "partial" });
  });
  it("a position that moved against the order side is flagged, so verification fails", () => {
    expect(describeFill(buy(10n), 100n, 90n).direction).toBe("opposite to order");
    expect(compareReadback({ direction: "matches order" }, describeFill(buy(10n), 100n, 90n)).ok).toBe(false);
  });
  it("signedLots maps Perpl position types", () => {
    expect(signedLots(5n, 0)).toBe(5n);
    expect(signedLots(5n, 1)).toBe(-5n);
  });
});

describe("receipt validation is not satisfied by a note", () => {
  const base = { id: "x", environment: "testnet", network: "Monad Testnet", chain_id: 10143, timestamp_utc: "2026-10-12T10:00:00Z", git_commit: null, operation: "trade", status: "TESTNET_VERIFIED", tx_hash: "0x" + "ab".repeat(32), block_number: 1, contract: null, explorer_url: null, inputs: {}, outputs: {}, notes: "" };
  it("rejects a VERIFIED receipt whose verification is only a note", () => {
    expect(validateReceipt({ ...base, verification: { note: "not a readback" } }, "proof/receipts/testnet/x.json").map((f) => f.rule)).toContain("verification");
  });
  it("rejects a VERIFIED transaction receipt without its block number", () => {
    expect(validateReceipt({ ...base, block_number: null, verification: { method: "second RPC", observed: "1" } }, "proof/receipts/testnet/x.json").length).toBeGreaterThan(0);
  });
  it("accepts a method plus a recorded reading", () => {
    expect(validateReceipt({ ...base, verification: { method: "second RPC at the receipt block", lotsOnVerifyRpc: "359" } }, "proof/receipts/testnet/x.json")).toEqual([]);
  });
});

describe("money previews (LP, claim, max order, close message)", () => {
  const desk = (status: number, borrowed: bigint, equity: bigint, stake = 100_000_000n, fee = 0n) => ({ status, borrowed, equity, originalStake: stake, feeOutstanding: fee });
  it("LP totals include an enforcing funded desk: 400 borrowed, 350 equity is a 50 AUSD shortfall", () => {
    const x = lpExposure([desk(1, 400_000_000n, 350_000_000n, 100_000_000n, 1_000n)]);
    expect(x.principalAtRisk).toBe(50_000_000n);
    expect(x.enforcing).toBe(1);
    expect(x.funded).toBe(1);
    expect(x.stakes).toBe(100_000_000n);
    expect(x.feeLiabilities).toBe(1_000n);
  });
  it("LP totals exclude closed desks and count no shortfall when equity covers the loan", () => {
    const x = lpExposure([desk(2, 400_000_000n, 0n), desk(0, 400_000_000n, 493_000_000n), desk(0, 0n, 99_000_000n)]);
    expect(x.principalAtRisk).toBe(0n);
    expect(x.active).toBe(2);
    expect(x.funded).toBe(1);
    expect(x.stakes).toBe(200_000_000n);
  });
  const r = (o: Partial<{ status: number; flat: boolean; equity: bigint; hwm: bigint; feeOutstanding: bigint }>) => ({ status: 0, flat: true, equity: 100_000_000n, hwm: 100_000_000n, feeOutstanding: 0n, ...o });
  it("claim preview never counts unrealized profit, and an open position is never claimable", () => {
    const open = claimPreview(r({ flat: false, equity: 110_000_000n }), 10_000_000n, 8000, 500);
    expect(open.split.gross).toBe(0n);
    expect(open.claimable).toBe(false);
    expect(open.message).not.toMatch(/^Eligible/);
    const openRealized = claimPreview(r({ flat: false, equity: 115_000_000n }), 10_000_000n, 8000, 500);
    expect(openRealized.split.gross).toBe(5_000_000n);
    expect(openRealized.claimable).toBe(false);
    expect(openRealized.message).toMatch(/close all positions first/);
  });
  it("claim preview: flat profit is claimable with the exact split; enforcing, zero-profit and fees-only cases are consistent", () => {
    const ok = claimPreview(r({ equity: 105_000_000n, feeOutstanding: 1_000_000n }), 0n, 8000, 500);
    expect(ok.claimable).toBe(true);
    expect(ok.split).toMatchObject({ gross: 5_000_000n, feesPaid: 1_000_000n, traderShare: 3_200_000n, protocolShare: 200_000n, poolShare: 600_000n });
    expect(claimPreview(r({ status: 1, equity: 105_000_000n }), 0n, 8000, 500).claimable).toBe(false);
    expect(claimPreview(r({ equity: 99_911_529n }), 0n, 0, 0)).toMatchObject({ claimable: false, message: "Realized equity is not above the high-water mark." });
    const feesOnly = claimPreview(r({ equity: 100_010_000n, feeOutstanding: 50_000n }), 0n, 8000, 500);
    expect(feesOnly.claimable).toBe(true); // the contract accepts it; the trader share is zero
    expect(feesOnly.split.traderShare).toBe(0n);
  });
  it("max new order takes the tightest of leverage, desk cap and market pool cap, and names it", () => {
    // Audited funded desk: equity 493.713365, 5x, flat; desk cap 1000.
    const funded = { equity: 493_713_365n, maxLeverageHdths: 500, usedNotional: 0n, borrowed: 400_000_000n };
    expect(maxNewOrder({ ...funded, pool: { deskNotionalCap: 1_000_000_000n, marketCap: 5_000_000_000n, marketGross: 0n, symbol: "BTC" } })).toEqual({ value: 1_000_000_000n, limit: "desk cap" });
    expect(maxNewOrder({ ...funded, pool: { deskNotionalCap: 1_000_000_000n, marketCap: 5_000_000_000n, marketGross: 4_700_000_000n, symbol: "BTC" } })).toEqual({ value: 300_000_000n, limit: "BTC pool cap" });
    expect(maxNewOrder({ ...funded, equity: 150_000_000n, pool: { deskNotionalCap: 1_000_000_000n, marketCap: 5_000_000_000n, marketGross: 0n, symbol: "BTC" } })).toEqual({ value: 750_000_000n, limit: "leverage" });
    expect(maxNewOrder(funded)).toBeNull(); // pool limits not loaded: unknown, not unlimited
    expect(maxNewOrder({ equity: 99_911_529n, maxLeverageHdths: 500, usedNotional: 0n, borrowed: 0n })).toEqual({ value: 499_557_645n, limit: "leverage" });
    expect(maxNewOrder({ ...funded, usedNotional: 1_200_000_000n, pool: { deskNotionalCap: 1_000_000_000n, marketCap: 5_000_000_000n, marketGross: 0n, symbol: "BTC" } })!.value).toBe(0n);
  });
  it("closing one market while another is open does not call the desk flat", () => {
    expect(closedMarketMessage("BTC", ["ETH long"])).toMatch(/Still open: ETH long\. The desk is not flat/);
    expect(closedMarketMessage("BTC", [])).toMatch(/the desk is flat/);
    expect(closedMarketMessage("BTC", null)).not.toMatch(/desk is flat/);
  });
});

describe("a receipt is bound to the exact requested order", () => {
  const order = { perpId: 16n, side: 0, priceLimit: 834000n, lots: 10n, leverage: 300n, reduceOnly: false, fillOrKill: false };
  const ev = { perpId: 16n, side: 0, orderType: 0, priceLimit: 834000n, lots: 10n, leverage: 300n, fillOrKill: false, nonce: 7n };
  it("accepts the matching event", () => expect(eventMatchesOrder(ev, order, 7n)).toBe("yes"));
  it("rejects another valid same-direction trade (size, price, leverage, nonce)", () => {
    expect(eventMatchesOrder({ ...ev, lots: 100n }, order, 7n)).toMatch(/^lots/);
    expect(eventMatchesOrder({ ...ev, priceLimit: 900000n }, order, 7n)).toMatch(/^priceLimit/);
    expect(eventMatchesOrder({ ...ev, leverage: 500n }, order, 7n)).toMatch(/^leverage/);
    expect(eventMatchesOrder({ ...ev, nonce: 6n }, order, 7n)).toMatch(/^nonce/);
    expect(eventMatchesOrder({ ...ev, perpId: 32n }, order, 7n)).toMatch(/^perpId/);
  });
  it("checks reduce-only through the Perpl order type", () => {
    const close = { ...order, side: 1, reduceOnly: true };
    expect(eventMatchesOrder({ ...ev, side: 1, orderType: 2 }, close, 7n)).toBe("yes");
    expect(eventMatchesOrder({ ...ev, side: 1, orderType: 1 }, close, 7n)).toMatch(/^orderType/);
    expect(compareReadback({ orderMatches: "yes" }, { orderMatches: eventMatchesOrder({ ...ev, lots: 100n }, order, 7n) }).ok).toBe(false);
  });
});

describe("lost transactions: lookups, release and the send gate", () => {
  const ok = <T,>(value: T | null) => ({ ok: true as const, value });
  const fail = (error = "HTTP 503") => ({ ok: false as const, error });
  const rc = (blockNumber: bigint, status: "success" | "reverted" = "success") => ({ status, blockNumber });
  it("an RPC failure is never read as 'not found' or 'dropped'", () => {
    expect(decideFromReceipts(fail(), fail())).toEqual({ kind: "lookup-failed", error: "HTTP 503" });
    expect(decideFromReceipts(ok(null), fail("timeout"))).toEqual({ kind: "lookup-failed", error: "timeout" });
    // Both failing for any duration never enables a release.
    expect(releasable(fail(), fail(), 60 * 60_000)).toBe(false);
    expect(releasable(ok(null), fail(), 60 * 60_000)).toBe(false);
  });
  it("mined requires two providers at the same block; one provider stays unresolved", () => {
    expect(decideFromReceipts(ok(rc(10n)), ok(rc(10n)))).toEqual({ kind: "mined", blockNumber: 10n });
    expect(decideFromReceipts(ok(rc(10n)), fail())).toEqual({ kind: "single-provider", blockNumber: 10n, which: "primary" });
    expect(decideFromReceipts(fail(), ok(rc(10n)))).toEqual({ kind: "single-provider", blockNumber: 10n, which: "second" });
    expect(decideFromReceipts(ok(rc(10n)), ok(rc(11n))).kind).toBe("single-provider");
    expect(decideFromReceipts(ok(rc(10n, "reverted")), fail())).toEqual({ kind: "failed", blockNumber: 10n });
  });
  it("release is possible only after 10 minutes of definite not-found on both providers", () => {
    expect(decideFromReceipts(ok(null), ok(null))).toEqual({ kind: "check-pending" });
    expect(releasable(ok(null), ok(null), 11 * 60_000)).toBe(true);
    expect(releasable(ok(null), ok(null), 9 * 60_000)).toBe(false);
    expect(releasable(ok({ hash: "0x" }), ok(null), 11 * 60_000)).toBe(false); // still pending somewhere
  });
  it("two concurrent sends: only the first passes the gate until it is released", async () => {
    const gate = new SendGate();
    let sends = 0;
    const run = async () => {
      if (!gate.tryAcquire()) return "refused";
      try {
        await new Promise((r) => setTimeout(r, 20)); // slow expectations, signer and relay
        sends++;
        return "sent";
      } finally {
        gate.release();
      }
    };
    expect(await Promise.all([run(), run()])).toEqual(["sent", "refused"]);
    expect(sends).toBe(1);
    expect(await run()).toBe("sent"); // released afterwards
  });
});
