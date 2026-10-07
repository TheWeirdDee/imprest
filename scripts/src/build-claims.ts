/**
 * Generates proof/claims/*.json FROM evidence artifacts, so a displayed number can never
 * drift from its source. Anything without an artifact is emitted as PENDING with value
 * null. Run after any proof run:  pnpm --filter @imprest/scripts build-claims
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Claim } from "@imprest/core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => (existsSync(resolve(ROOT, p)) ? JSON.parse(readFileSync(resolve(ROOT, p), "utf8")) : null);
const AUSD = (v: number | string) => (Number(v) / 1e6).toFixed(2);

const claims: Claim[] = [];
const base = (c: Partial<Claim> & Pick<Claim, "claim_id" | "statement" | "status" | "methodology" | "source">): Claim => ({
  value: null,
  unit: null,
  network: "local Foundry EVM",
  chain_id: null,
  contract: null,
  evidence: [],
  transaction_hash: null,
  block_number: null,
  timestamp_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  sample_size: null,
  denominator: null,
  ...c,
});

// ---------------- Gate 0 (read-only chain reads, two independent RPCs) ----------------
for (const env of ["testnet", "mainnet"] as const) {
  const r = read(`proof/receipts/${env}/gate0.json`);
  const NET = env === "mainnet" ? "Monad Mainnet" : "Monad Testnet";
  if (!r || !String(r.status).endsWith("VERIFIED")) {
    claims.push(base({ claim_id: `GATE0_WHITELIST_${env.toUpperCase()}`, statement: `Perpl whitelisting state on ${NET}`, status: "PENDING", network: NET, methodology: "read-only eth_call whitelistingEnabled() on two RPCs", source: "scripts/src/gate0.ts" }));
    continue;
  }
  claims.push(
    base({
      claim_id: `GATE0_WHITELIST_${env.toUpperCase()}`,
      statement: `Perpl's exchange on ${NET} has whitelisting disabled, so a desk contract can open its own account without a whitelist step`,
      value: r.outputs.whitelistingEnabled,
      unit: "whitelistingEnabled()",
      network: NET,
      chain_id: r.chain_id,
      contract: r.contract,
      evidence: [`proof/receipts/${env}/gate0.json`],
      block_number: r.block_number,
      timestamp_utc: r.timestamp_utc,
      status: r.status,
      methodology: "read-only eth_call at a pinned block on two independent RPC providers; readbacks agree",
      source: "scripts/src/gate0.ts",
    }),
  );
  claims.push(
    base({
      claim_id: `GATE0_COLLATERAL_${env.toUpperCase()}`,
      statement: `Perpl's ${NET} exchange margins in Agora AUSD (${r.outputs.collateralToken})`,
      value: r.outputs.collateralSymbol,
      unit: "collateral symbol",
      network: NET,
      chain_id: r.chain_id,
      contract: r.contract,
      evidence: [`proof/receipts/${env}/gate0.json`],
      block_number: r.block_number,
      timestamp_utc: r.timestamp_utc,
      status: r.status,
      methodology: "read-only eth_call getExchangeInfo() and ERC20 symbol() at a pinned block on two RPCs",
      source: "scripts/src/gate0.ts",
    }),
  );
  claims.push(
    base({
      claim_id: `GATE0_MIN_ACCOUNT_${env.toUpperCase()}`,
      statement: `Minimum AUSD to open a Perpl account on ${NET}`,
      value: AUSD(r.outputs.minAccountOpenCNS),
      unit: "AUSD",
      network: NET,
      chain_id: r.chain_id,
      contract: r.contract,
      evidence: [`proof/receipts/${env}/gate0.json`],
      block_number: r.block_number,
      timestamp_utc: r.timestamp_utc,
      status: r.status,
      methodology: "read-only eth_call getMinAccountOpenCNS() at a pinned block on two RPCs",
      source: "scripts/src/gate0.ts",
    }),
  );
}

// ---------------- Local bytecode harness ----------------
const forge = read("proof/local/forge-test-results.json");
if (forge?.forge?.total) {
  claims.push(
    base({
      claim_id: "LOCAL_CONTRACT_SUITE",
      statement: "Imprest contract tests passing against Perpl's own exchange bytecode (rc_v1.1.7-203) on a local EVM",
      value: `${forge.forge.passed}/${forge.forge.total}`,
      unit: "tests",
      evidence: ["proof/local/forge-test-results.json"],
      timestamp_utc: forge.forge.finished_utc,
      status: forge.forge.failed === 0 ? "LOCAL_REPRODUCTION" : "PENDING",
      methodology: forge.forge.command,
      source: "contracts/test",
      sample_size: forge.forge.total,
      denominator: "all contract tests excluding the opt-in testnet fork test",
    }),
  );
  const find = (suite: string, test: string) =>
    forge.forge.suites.find((s: any) => s.suite.endsWith(suite))?.tests.find((t: any) => t.test.startsWith(test));
  const lev = find("DeskPolicyTest", "test_leverage_oneUnitOverCapRejected");
  if (lev) {
    claims.push(
      base({
        claim_id: "LOCAL_GUARDED_ORDER_REJECTION",
        statement: "An order one unit over the 5.00x leverage cap (5.01x) is rejected by the Desk contract with LeverageExceeded, and no position exists afterwards",
        value: lev.pass,
        unit: "test passed",
        evidence: ["proof/local/forge-test-results.json", "contracts/test/unit/DeskPolicy.t.sol"],
        timestamp_utc: forge.forge.finished_utc,
        status: lev.pass ? "LOCAL_REPRODUCTION" : "PENDING",
        methodology: "Direct Desk.trade() call bypassing any frontend; Perpl bytecode harness",
        source: "contracts/test/unit/DeskPolicy.t.sol::test_leverage_oneUnitOverCapRejected",
      }),
    );
  }
  if (forge.invariant_coverage) {
    claims.push(
      base({
        claim_id: "LOCAL_INVARIANT_CAMPAIGN",
        statement: "Stateful invariant campaign (cash-basis pool identity, principal and exposure ledgers, fee subledger and cap, closed desks empty) held across every run",
        value: forge.invariant_coverage.handler_calls,
        unit: "random handler calls",
        evidence: ["proof/local/forge-test-results.json", "contracts/test/invariant/PoolInvariant.t.sol"],
        timestamp_utc: forge.forge.finished_utc,
        status: "LOCAL_REPRODUCTION",
        methodology: `forge invariant runs; coverage: ${forge.invariant_coverage.desks_opened} desks, ${forge.invariant_coverage.random_trades_ok} random trades, ${forge.invariant_coverage.graduations} graduations, ${forge.invariant_coverage.settlements} settlements, ${forge.invariant_coverage.claims} claims`,
        source: "contracts/test/invariant/PoolInvariant.t.sol",
        sample_size: forge.invariant_coverage.runs_logged,
        denominator: "invariant runs logged",
      }),
    );
  }
}

const fork = read("proof/local/testnet-fork-run.json");
if (fork) {
  const lots = fork.logs?.find((l: string) => l.startsWith("lots filled against live testnet book"));
  const filled = lots ? Number(lots.split(":")[1]) : null;
  claims.push(
    base({
      claim_id: "FORK_LIVE_TESTNET_BOOK_FILL",
      statement: "In a fork of live Monad testnet, a desk opened its own Perpl account, filled an IOC order against the real testnet order book, and closed reduce-only; a 6x order was refused by the contract",
      value: fork.pass && filled !== null ? `${filled} lots (BTC, 0.00001 BTC each)` : null,
      unit: "lots",
      network: "Monad Testnet fork (local, nothing broadcast)",
      evidence: ["proof/local/testnet-fork-run.json", "contracts/test/perpl/TestnetFork.t.sol"],
      timestamp_utc: fork.started_utc,
      status: fork.pass && filled !== null ? "SIMULATED" : "PENDING",
      methodology: fork.command,
      source: "contracts/test/perpl/TestnetFork.t.sol",
    }),
  );
}

const ref = read("proof/reference_model/results.json");
if (ref) {
  claims.push(
    base({
      claim_id: "REFERENCE_MODEL_AGREEMENT",
      statement: "Independent Python reference model (exact rational arithmetic, no shared code) agrees with contract outputs from real desk executions",
      value: `${ref.cases - ref.failures}/${ref.cases}`,
      unit: "cases",
      evidence: ["proof/reference_model/results.json", "proof/reference_model/imprest_model.py"],
      timestamp_utc: ref.generated_utc,
      status: ref.failures === 0 ? "LOCAL_REPRODUCTION" : "PENDING",
      methodology: ref.method,
      source: "proof/reference_model/run_reference.py",
      sample_size: ref.cases,
      denominator: "accrual, claim, settlement and paired-desk identity cases",
    }),
  );
}

const pdDir = resolve(ROOT, "proof/experiments/paired-desk");
if (existsSync(pdDir)) {
  for (const f of readdirSync(pdDir).filter((x) => x.endsWith(".json")).sort()) {
    const d = JSON.parse(readFileSync(resolve(pdDir, f), "utf8"));
    claims.push(
      base({
        claim_id: `PAIRED_DESK_${d.scenario.toUpperCase()}`,
        statement: `Paired long/short desks run by one actor, scored jointly (${d.scenario}): pool net result after principal loss, fees and profit share`,
        value: AUSD(d.pool_net_result),
        unit: "AUSD (pool net, negative = pool loss)",
        evidence: [`proof/experiments/paired-desk/${f}`, "contracts/test/security/PairedDesk.t.sol"],
        timestamp_utc: forge?.forge?.finished_utc ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        status: "LOCAL_REPRODUCTION",
        methodology: `Perpl bytecode harness; move ${d.total_move_bps} bps in ${d.steps} step(s); desk notional cap ${AUSD(d.desk_notional_cap_base_units)} AUSD; principal loss ${AUSD(d.pool_principal_loss)}; actor net extraction ${AUSD(d.actor_net_extraction)}. A measured scenario, not a universal bound.`,
        source: "contracts/test/security/PairedDesk.t.sol",
        sample_size: 1,
        denominator: "one deterministic scenario run",
      }),
    );
  }
}

const gas = read("proof/local/gas-profile.json");
if (gas) {
  claims.push(
    base({
      claim_id: "LOCAL_GUARDED_TRADE_GAS",
      statement: "Gas used by a guarded desk trade (policy checks + Perpl fill + floor re-check), measured on Foundry's Ethereum gas schedule",
      value: gas.guarded_trade_open,
      unit: "gas (Ethereum schedule, not Monad pricing)",
      evidence: ["proof/local/gas-profile.json"],
      status: "LOCAL_REPRODUCTION",
      methodology: "gasleft() delta around Desk.trade in contracts/test/perpl/GasProfile.t.sol",
      source: "contracts/test/perpl/GasProfile.t.sol",
    }),
  );
}

const stale = read("proof/experiments/mark-staleness-testnet.json");
if (stale) {
  const btc = stale.summary.find((s: any) => s.market === "BTC");
  claims.push(
    base({
      claim_id: "TESTNET_MARK_STALENESS_SAMPLE",
      statement: "Share of sampled testnet blocks where Perpl's BTC mark was older than its 60 s max age (when desks refuse new risk)",
      value: `${btc.stale_samples}/${btc.samples}`,
      unit: "stale samples",
      network: "Monad Testnet",
      chain_id: 10143,
      contract: "0x1964C32f0bE608E7D29302AFF5E61268E72080cc",
      evidence: ["proof/receipts/testnet/mark-staleness.json", "proof/experiments/mark-staleness-testnet.json"],
      block_number: Number(stale.window.to_block),
      timestamp_utc: stale.generated_utc,
      status: "TESTNET_VERIFIED",
      methodology: `${stale.method}; window blocks ${stale.window.from_block}-${stale.window.to_block}, stride ${stale.window.stride_blocks}`,
      source: "scripts/src/mark-staleness.ts",
      sample_size: btc.samples,
      denominator: "sampled blocks",
    }),
  );
}

const replay = read("proof/experiments/replay/results.json");
if (replay) {
  claims.push(
    base({
      claim_id: "REPLAY_ATOMIC_VS_KEEPER_OVERSHOOT",
      statement:
        "Median overshoot past the floor: in-transaction enforcement vs a 1 s keeper, on replayed real BTC/ETH 1-second history (pre-registered protocol; null threshold 10 bps)",
      value: `${replay.median_gap_vs_1s_keeper_bps} bps median gap (n=${replay.windows}); ${String(replay.decision).startsWith("NULL") ? "null threshold hit, overshoot headline dropped" : "headline supported"}`,
      unit: "bps of desk equity",
      network: "simulation on real Binance spot price history",
      evidence: ["proof/experiments/replay/results.json", "proof/experiments/replay/PROTOCOL.md", "proof/experiments/replay/data/MANIFEST.json"],
      timestamp_utc: replay.generated_utc,
      status: "SIMULATED",
      methodology: `${replay.label}. Breaches per arm: treatment ${replay.summary.treatment.breaches}, 1 s ${replay.summary.keeper_1s.breaches}, 5 s ${replay.summary.keeper_5s.breaches}, 10 s ${replay.summary.keeper_10s.breaches}; max overshoot treatment ${replay.summary.treatment.max_overshoot_bps} bps vs 10 s keeper ${replay.summary.keeper_10s.max_overshoot_bps} bps; pool loss beyond stake 0 in every arm.`,
      source: "proof/experiments/replay/replay.py",
      sample_size: replay.windows,
      denominator: "replayed breach windows (protocol target up to 100)",
    }),
  );
}

// ---------------- Testnet deployment and canonical-run claims ----------------
const depDir = resolve(ROOT, "proof/receipts/deployments");
const depFiles = existsSync(depDir) ? readdirSync(depDir).filter((f) => f.startsWith("testnet-") && f.endsWith(".json")) : [];
for (const f of depFiles) {
  const d = JSON.parse(readFileSync(resolve(depDir, f), "utf8"));
  claims.push(
    base({
      claim_id: `TESTNET_DEPLOYMENT_${String(d.contract_name).toUpperCase()}`,
      statement: `${d.contract_name} deployed on Monad testnet; deployed runtime matches the compiled bytecode (immutables masked)`,
      value: d.address,
      unit: "address",
      network: "Monad Testnet",
      chain_id: 10143,
      contract: d.address,
      evidence: [`proof/receipts/deployments/${f}`],
      transaction_hash: d.tx_hash,
      block_number: d.block_number,
      timestamp_utc: d.timestamp_utc,
      status: d.status,
      methodology: d.verification?.method ?? "deployment receipt read on two RPCs",
      source: "contracts/script/Deploy.s.sol",
    }),
  );
}

const pendingRun = [
  ["TESTNET_CANONICAL_GUARDED_REJECTION", "An over-limit order sent directly to Desk.trade() on Monad testnet reverts with the named contract error", "Monad Testnet"],
  ["TESTNET_CANONICAL_GRADUATION", "A desk graduates on Monad testnet and is funded by the pool", "Monad Testnet"],
  ["TESTNET_CANONICAL_CLAIM_PAID", "Realized profit claimed on Monad testnet and verified on an independent RPC", "Monad Testnet"],
  ["TESTNET_CANONICAL_CLOSE_PAYOUT", "A flat desk closed on Monad testnet with its residual paid by contract and verified on an independent RPC", "Monad Testnet"],
  ["MAINNET_AUSD_PAID_BY_CONTRACT", "AUSD paid out by contract to real traders on Monad mainnet", "Monad Mainnet"],
  ["MAINNET_CLAIM_TO_VERIFIED_SECONDS", "Seconds from claim submission to an independently verified wallet balance on mainnet", "Monad Mainnet"],
  ["MAINNET_PRINCIPAL_LOSS_BEYOND_STAKES", "Pool principal loss beyond first-loss stakes across included mainnet breaches", "Monad Mainnet"],
  ["MAINNET_REAL_TRADERS_FUNDED", "Real outside traders evaluated and funded on mainnet", "Monad Mainnet"],
  ["REPLAY_ATOMIC_VS_KEEPER_OVERSHOOT", "Median overshoot past the floor: in-transaction enforcement vs a 1 s keeper over 100 replayed BTC/ETH windows", "simulation"],
  ["KEEPER_BOUNTY_COVERS_MONAD_GAS", "The payable 0.5 AUSD keeper bounty exceeds measured Monad enforce() gas cost plus margin", "Monad Testnet"],
] as const;
const existing = new Set(claims.map((c) => c.claim_id));
for (const [id, statement, net] of pendingRun) {
  if (existing.has(id)) continue;
  const fromRun = read(`proof/claims-input/${id}.json`);
  claims.push(
    fromRun ??
      base({ claim_id: id, statement, status: "PENDING", network: net, methodology: "Not yet measured. See docs/FINAL_STATUS.md for the gate that produces it.", source: "pending" }),
  );
}

const out = resolve(ROOT, "proof/claims");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const c of claims) writeFileSync(resolve(out, `${c.claim_id}.json`), JSON.stringify(c, null, 2));
writeFileSync(resolve(out, "index.json"), JSON.stringify({ generated_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), claims: claims.map((c) => c.claim_id) }, null, 2));
console.log(`claims: ${claims.length} (${claims.filter((c) => c.status === "PENDING").length} PENDING)`);
for (const c of claims) console.log(`  ${c.status.padEnd(19)} ${c.claim_id} = ${c.value}`);
