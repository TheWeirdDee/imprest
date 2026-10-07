/**
 * Generates docs/TEST_MATRIX.md and docs/CLAIM_LEDGER.md from evidence files, so the docs
 * can never claim a test passed that the recorded run does not show.
 *   pnpm --filter @imprest/scripts gen-docs
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Claim } from "@imprest/core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => (existsSync(resolve(ROOT, p)) ? JSON.parse(readFileSync(resolve(ROOT, p), "utf8")) : null);
const forge = read("proof/local/forge-test-results.json");
const results = new Map<string, boolean>();
for (const s of forge?.forge?.suites ?? []) for (const t of s.tests) results.set(`${s.suite.split(":").pop()}::${t.test.replace(/\(.*$/, "")}`, t.pass);

type Row = [id: string, requirement: string, tests: string[], env?: string];
const C = "contracts (Perpl bytecode harness)";
const ROWS: Row[] = [
  ["I-01", "Trader cannot withdraw pool principal", ["AttacksTest::test_lp_cannotWithdrawDeployedPrincipal", "AttacksTest::test_unauth_poolMoneyPathsRequireRegisteredDesk", "PoolInvariantTest::invariant_cashBasisIdentity"]],
  ["I-02", "Every order receives the policy stamp", ["DeskPolicyTest::test_orderType_stampIsAlwaysImmediate", "DeskPolicyTest::test_stamp_negPnlAndExecutionBlock"]],
  ["I-03", "Leverage cannot exceed the limit", ["DeskPolicyTest::test_leverage_exactlyAtCapAccepted", "DeskPolicyTest::test_leverage_oneUnitOverCapRejected", "DeskPolicyTest::testFuzz_leverage_aboveCapAlwaysRejected"]],
  ["I-04", "Only allowlisted markets", ["DeskPolicyTest::test_market_notAllowlistedRejected"]],
  ["I-05", "Only IOC/FOK orders", ["DeskPolicyTest::test_orderType_stampIsAlwaysImmediate", "DeskPolicyTest::test_orderType_fokStampedAndRevertsAtomicallyWithoutLiquidity", "DeskPolicyTest::test_orderType_iocWithoutLiquidityLeavesNoPosition"]],
  ["I-06", "Price within the band", ["DeskPolicyTest::test_priceBand_exactlyAtBandAccepted", "DeskPolicyTest::test_priceBand_oneTickOutsideRejected", "DeskPolicyTest::test_priceBand_appliesToClosesToo", "DeskPolicyTest::testFuzz_priceBand"]],
  ["I-07", "maxNegPnlCollatBPS enforced", ["DeskPolicyTest::test_stamp_negPnlAndExecutionBlock", "DeskPolicyTest::test_negPnlStamp_perplRejectsFillFarFromMarkWithinBand", "DeskPolicyTest::test_negPnlStamp_venueRefusesAddingToUnderwaterPosition"]],
  ["I-08", "lastExecutionBlock stamped", ["DeskPolicyTest::test_stamp_negPnlAndExecutionBlock"]],
  ["I-09", "Equity floor before/after trade", ["DeskPolicyTest::test_floor_breachedDeskRejectsNewRiskAndReduce", "DeskPolicyTest::test_floor_postTradeBreachRevertsWholeTransaction"]],
  ["I-10", "Invalid order reverts atomically", ["DeskPolicyTest::test_floor_postTradeBreachRevertsWholeTransaction", "DeskPolicyTest::test_orderType_fokStampedAndRevertsAtomicallyWithoutLiquidity"]],
  ["I-11", "Signed order cannot replay", ["AttacksTest::test_relay_validSignedOrderExecutesOnce"]],
  ["I-12", "Nonce strictly increases", ["AttacksTest::test_relay_lowerNonceRejected"]],
  ["I-13", "Deadline enforced", ["AttacksTest::test_relay_expiredDeadlineRejected"]],
  ["I-14", "Stale mark prevents new risk", ["DeskPolicyTest::test_staleMark_refusesNewRiskAllowsReduceOnly"]],
  ["I-15", "Reduce-only possible during stale state", ["DeskPolicyTest::test_staleMark_refusesNewRiskAllowsReduceOnly"]],
  ["I-16", "claim() rejects with an open position", ["DeskLifecycleTest::test_fullLifecycle_demoCohort_graduateTradeClaimClose", "DeskSettlementTest::test_claim_unrealizedProfitCannotBeWithdrawn"]],
  ["I-17", "claim() distributes only realized profit", ["DeskSettlementTest::test_claim_unrealizedProfitCannotBeWithdrawn", "SettlementMathTest::testFuzz_claimSplit_conservesGross"]],
  ["I-18", "HWM cannot be double claimed", ["DeskSettlementTest::test_claim_hwmPreventsReclaimAfterLossAndRecovery", "DeskLifecycleTest::test_fullLifecycle_demoCohort_graduateTradeClaimClose"]],
  ["I-19", "Fees accrue only during exposure", ["DeskSettlementTest::test_fees_exposedIntervalAccruesExactlyOnceDespitePositionsAndCheckpoints", "DeskSettlementTest::test_fees_chunkedCheckpointsCannotRoundFeesAway"]],
  ["I-20", "Flat desks accrue zero new fees", ["DeskSettlementTest::test_fees_flatFundedDeskAccruesNothingForAMonth", "DeskSettlementTest::test_fees_evaluationDeskAccruesNothing"]],
  ["I-21", "Fee cap enforced", ["DeskSettlementTest::test_fees_capStopsAccrualAndNewRiskButAllowsReduceAndEnforce", "SettlementMathTest::testFuzz_accrue_neverExceedsCap"]],
  ["I-22", "Fee cap cannot consume principal", ["DeskSettlementTest::test_fees_capStopsAccrualAndNewRiskButAllowsReduceAndEnforce", "SettlementMathTest::testFuzz_waterfall_conservesCashAndOrdersPriority"]],
  ["I-23", "Fee write-offs explicit", ["SettlementMathTest::testFuzz_waterfall_conservesCashAndOrdersPriority", "PoolInvariantTest::invariant_feeSubledgerAndCap"]],
  ["I-24", "Settlement reconciles actual cash", ["DeskSettlementTest::test_enforce_breachSettlesWaterfallAndPaysKeeperOnce", "ReferenceVectorsTest::test_vectors_settlements"]],
  ["I-25", "Keeper bounty paid at most once", ["DeskSettlementTest::test_enforce_breachSettlesWaterfallAndPaysKeeperOnce"]],
  ["I-26", "Voluntary close has no keeper bounty", ["DeskSettlementTest::test_close_voluntaryPaysNoKeeperAndRequiresFlat"]],
  ["I-27", "Partial closure cannot prematurely settle", ["DeskSettlementTest::test_enforce_partialCloseDoesNotSettleAndPaysNothing"]],
  ["I-28", "Pool exposure cap cannot be bypassed", ["AttacksTest::test_caps_grossCapAcrossDesksCannotBeBypassed", "AttacksTest::test_caps_increaseIsTimelocked"]],
  ["I-29", "Per-desk notional cap cannot be bypassed", ["AttacksTest::test_caps_perDeskNotionalCap", "AttacksTest::test_unauth_deskCannotUnderReportExposure"]],
  ["I-30", "Pause cannot block closes/claims", ["DeskSettlementTest::test_graduation_pausedPoolBlocksButCloseStillWorks", "DeskSettlementTest::test_factoryPause_blocksNewDesksOnly"]],
  ["I-31", "Unauthorized addresses cannot move pool funds", ["AttacksTest::test_unauth_poolMoneyPathsRequireRegisteredDesk", "AttacksTest::test_unauth_deskCannotDrawCreditForAnotherDesk", "AttacksTest::test_unauth_operatorCannotMoveFunds"]],
  ["I-32", "Reentrancy protections work", ["ReentrancyTest::test_reentry_claimDuringTrade", "ReentrancyTest::test_reentry_enforceDuringTrade", "ReentrancyTest::test_reentry_tradeDuringTrade", "ReentrancyTest::test_reentry_closeDuringTrade", "ReentrancyTest::test_reentry_graduateDuringTrade"]],
  ["I-33", "Unexpected external calls fail safely", ["AttacksTest::test_venue_haltedExchangeBlocksTradingButEnforceStatePersists", "DeskSettlementTest::test_enforce_bankruptPositionWithoutVenueInsuranceStaysEnforcing"]],
  ["I-34", "Perpl errors surfaced", ["AttacksTest::test_venue_perplErrorsSurfaceNamed"]],
  ["I-35", "Indexer cannot authorize money movement", [], "design: no contract reads the indexer; web/keeper read chain (docs/ARCHITECTURE.md)"],
  ["I-36", "UI cannot authorize money movement", ["AttacksTest::test_relay_signedOrderStillPolicyChecked"], "plus web e2e: blocked order sent to contract is rejected onchain"],
  ["I-37", "Relayer cannot alter signed order", ["AttacksTest::test_relay_alteredFieldsRejected"], "plus relayer/test/relayer.test.ts"],
  ["I-38", "Relayer cannot replay signed order", ["AttacksTest::test_relay_validSignedOrderExecutesOnce"], "plus relayer/test/relayer.test.ts"],
  ["I-39", "Keeper cannot enforce a healthy desk", ["DeskSettlementTest::test_enforce_healthyDeskRejected", "AttacksTest::test_keeper_cannotGraduateIneligibleOrEnforceHealthy"], "plus keeper/test/decide.test.ts"],
  ["I-40", "Testnet deployment matches compiled bytecode", [], "scripts/src/sync-deployment.ts (rehearsed on a testnet fork; real deployment PENDING)"],
];

let md = `# Test matrix\n\nGenerated by \`scripts/src/gen-docs.ts\` from \`proof/local/forge-test-results.json\` (${forge?.forge?.finished_utc ?? "no run"}). Environment for every contract row: ${C}, LOCAL_REPRODUCTION. Commit: ${forge?.environment?.git_commit ?? "none (no commits authorized yet)"}.\n\n| ID | Requirement | Tests | Expected | Actual | Status | Evidence |\n| --- | --- | --- | --- | --- | --- | --- |\n`;
for (const [id, req, tests, note] of ROWS) {
  const found = tests.map((t) => ({ t, pass: results.get(t) }));
  const missing = found.filter((f) => f.pass === undefined);
  const allPass = found.length > 0 && found.every((f) => f.pass === true);
  const status = tests.length === 0 ? (note?.startsWith("design") ? "BY DESIGN" : "PENDING") : missing.length ? "MISSING" : allPass ? "PASS" : "FAIL";
  md += `| ${id} | ${req} | ${tests.map((t) => `\`${t}\``).join("<br>") || "n/a"} | pass | ${tests.length ? found.map((f) => (f.pass === undefined ? "not found" : f.pass ? "pass" : "fail")).join(", ") : "n/a"} | ${status} | ${tests.length ? "proof/local/forge-test-results.json" : ""}${note ? ` ${note}` : ""} |\n`;
}
const other = [
  ["S-01", "Core accounting, verification state machine, evidence rules", "packages/core/test/core.test.ts", "vitest"],
  ["S-02", "Relayer: malicious signer, altered fields, replay, stale deadline, quota, gas cap", "relayer/test/relayer.test.ts", "vitest"],
  ["S-03", "Keeper: healthy/breach/fee cap/partial/settled/stale decisions", "keeper/test/decide.test.ts", "vitest"],
  ["S-04", "Reference model agrees with contract outputs", "proof/reference_model/run_reference.py", "python"],
  ["S-05", "Web pages render, testnet banner, no overflow 375-1440 px, no console errors", "web/e2e/*.spec.ts", "playwright"],
  ["S-06", "Live testnet fork: real Perpl account and book fill", "contracts/test/perpl/TestnetFork.t.sol", "forge (FORK_TESTNET=true), SIMULATED"],
];
md += `\n## Services, model and browser\n\n| ID | Requirement | Test | Runner |\n| --- | --- | --- | --- |\n${other.map((o) => `| ${o.join(" | ")} |`).join("\n")}\n\nRun everything with \`pnpm test\`, \`pnpm proof:local\` and \`pnpm --filter @imprest/web e2e\`.\n`;
writeFileSync(resolve(ROOT, "docs/TEST_MATRIX.md"), md);

// Claim ledger
const claims: Claim[] = existsSync(resolve(ROOT, "proof/claims"))
  ? readdirSync(resolve(ROOT, "proof/claims")).filter((f) => f.endsWith(".json") && f !== "index.json").map((f) => read(`proof/claims/${f}`))
  : [];
const order = ["MAINNET_VERIFIED", "TESTNET_VERIFIED", "SIMULATED", "LOCAL_REPRODUCTION", "TARGET", "PENDING"];
claims.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.claim_id.localeCompare(b.claim_id));
let cl = `# Claim ledger\n\nGenerated by \`scripts/src/gen-docs.ts\` from \`proof/claims/\`, which is itself generated from evidence by \`scripts/src/build-claims.ts\` and checked by \`scripts/src/validate-evidence.ts\`. ${claims.length} claims.\n\n| Status | Claim | Value | Network | Evidence |\n| --- | --- | --- | --- | --- |\n`;
for (const c of claims) cl += `| ${c.status} | **${c.claim_id}**: ${c.statement} | ${c.value === null ? "PENDING" : String(c.value).replace(/\|/g, "/")} | ${c.network} | ${c.evidence.map((e) => `\`${e}\``).join("<br>") || "none yet"} |\n`;
writeFileSync(resolve(ROOT, "docs/CLAIM_LEDGER.md"), cl);
const counts = ROWS.map(([, , t]) => t.length === 0 ? "n/a" : t.every((x) => results.get(x)) ? "PASS" : "OTHER");
console.log(`TEST_MATRIX: ${counts.filter((x) => x === "PASS").length}/${ROWS.length} PASS; CLAIM_LEDGER: ${claims.length} claims`);
