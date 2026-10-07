/**
 * Testnet canonical run (Track A). Real Monad testnet transactions only; every step writes a
 * receipt with an independent second-RPC readback. Nothing is assumed to succeed.
 *
 *   DEPLOYER_PRIVATE_KEY=0x... IMPREST_ENV=testnet pnpm --filter @imprest/scripts testnet-demo
 *
 * The deployer key (owner-funded with testnet MON) seeds the pool from Agora's AUSD faucet and
 * tops up an ephemeral trader key stored in .secrets/ (gitignored).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  http,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { deskAbi, deskFactoryAbi, erc20Abi, getNetwork, imprestPoolAbi, perplExchangeAbi, toAppError, type Claim } from "@imprest/core";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// Rehearsals redirect every write (proof/, config/, .secrets/) away from the real repo.
const ROOT = process.env.IMPREST_OUTPUT_ROOT ? resolve(process.env.IMPREST_OUTPUT_ROOT) : REPO;
const env = "testnet";
const net0 = getNetwork(env);
// Rehearsal: a forked config written by sync-deployment under IMPREST_OUTPUT_ROOT.
const net = process.env.IMPREST_OUTPUT_ROOT && existsSync(resolve(ROOT, "config/networks.json")) ? { ...net0, imprest: JSON.parse(readFileSync(resolve(ROOT, "config/networks.json"), "utf8"))[env].imprest } : net0;
const RPC1 = process.env.IMPREST_RPC_PRIMARY ?? net.rpcUrls[0]!;
const RPC2 = process.env.IMPREST_RPC_VERIFY ?? (process.env.IMPREST_RPC_PRIMARY ? RPC1 : net.rpcUrls[1]!);
if (!net.imprest.factory || !net.imprest.pool) throw new Error("testnet deployment not recorded; run sync-deployment first");
const FACTORY = net.imprest.factory as Address;
const POOL = net.imprest.pool as Address;
const AUSD = net.perpl.collateralToken as Address;
const EX = net.perpl.exchange as Address;
const FAUCET = net.ausdFaucet!.address as Address;
const BTC = net.perpl.markets.find((m) => m.symbol === "BTC")!;
const chain = defineChain({ id: net.chainId, name: "Monad Testnet", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [RPC1] } } });
const pc = createPublicClient({ chain, transport: http(RPC1) }) as PublicClient;
const vc = createPublicClient({ chain, transport: http(RPC2) }) as PublicClient;
const deployer = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex);

function traderAccount(): PrivateKeyAccount {
  const dir = resolve(ROOT, ".secrets");
  const f = resolve(dir, "testnet-trader.key");
  mkdirSync(dir, { recursive: true });
  if (!existsSync(f)) writeFileSync(f, generatePrivateKey());
  return privateKeyToAccount(readFileSync(f, "utf8").trim() as Hex);
}
const trader = traderAccount();
const wallet = (a: PrivateKeyAccount) => createWalletClient({ chain, account: a, transport: http(RPC1) });
const iso = (s: number) => new Date(s * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");

// A rehearsal (fork, redirected output) is never evidence of a testnet result.
const REHEARSAL = Boolean(process.env.IMPREST_OUTPUT_ROOT || process.env.IMPREST_RPC_PRIMARY);
const OK_STATUS = (REHEARSAL ? "SIMULATED" : "TESTNET_VERIFIED") as "TESTNET_VERIFIED";

interface StepResult {
  id: string;
  status: "TESTNET_VERIFIED" | "PENDING";
  tx: Hex | null;
  block: number | null;
  expected: Record<string, string>;
  observed: Record<string, string>;
  outputs: Record<string, unknown>;
  submittedAt: number;
  verifiedAt: number | null;
}

async function waitVerify(block: bigint) {
  for (let i = 0; i < 75; i++) {
    if ((await vc.getBlockNumber()) >= block) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("verification RPC lagging");
}

async function receiptFile(r: StepResult, operation: string, notes: string, inputs: Record<string, unknown>) {
  const blk = r.block !== null ? await vc.getBlock({ blockNumber: BigInt(r.block) }) : null;
  const out = {
    id: r.id,
    environment: env,
    network: REHEARSAL ? "Monad Testnet FORK (rehearsal, nothing broadcast)" : "Monad Testnet",
    chain_id: net.chainId,
    timestamp_utc: blk ? iso(Number(blk.timestamp)) : new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    git_commit: null,
    operation,
    status: r.status,
    tx_hash: r.tx,
    block_number: r.block,
    contract: null,
    explorer_url: r.tx && net.explorer ? `${net.explorer.url}${net.explorer.tx}${r.tx}` : null,
    inputs,
    outputs: { ...r.outputs, seconds_submit_to_verified: r.verifiedAt ? (r.verifiedAt - r.submittedAt) / 1000 : null },
    verification: { method: "receipt and post-state read on the independent RPC at the receipt block", rpc: RPC2, expected: r.expected, observed: r.observed },
    notes,
  };
  mkdirSync(resolve(ROOT, "proof/receipts/testnet"), { recursive: true });
  writeFileSync(resolve(ROOT, `proof/receipts/testnet/${r.id.toLowerCase()}.json`), JSON.stringify(out, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  console.log(`${r.id}: ${r.status} ${r.tx ?? ""}`);
}

/** Sends a tx, waits for the receipt, and reads the expected post-state on the second RPC. */
async function step(
  id: string,
  send: () => Promise<Hex>,
  expect: Record<string, string>,
  observe: (block: bigint, receiptStatus: string) => Promise<Record<string, string>>,
  outputs: (rc: any) => Record<string, unknown> = () => ({}),
): Promise<StepResult> {
  const submittedAt = Date.now();
  const tx = await send();
  const rc = await pc.waitForTransactionReceipt({ hash: tx, timeout: 90_000 });
  await waitVerify(rc.blockNumber);
  const vrc = await vc.getTransactionReceipt({ hash: tx });
  const observed: Record<string, string> = { receiptStatus: vrc.status, ...(await observe(rc.blockNumber, vrc.status)) };
  const ok = Object.entries(expect).every(([k, v]) => observed[k] === v) && vrc.blockNumber === rc.blockNumber;
  return { id, status: ok ? OK_STATUS : "PENDING", tx, block: Number(rc.blockNumber), expected: expect, observed, outputs: outputs(rc), submittedAt, verifiedAt: ok ? Date.now() : null };
}

async function revertName(tx: Hex): Promise<string> {
  const t = await pc.getTransaction({ hash: tx });
  try {
    await pc.call({ account: t.from, to: t.to!, data: t.input, gas: t.gas, blockNumber: t.blockNumber! - 1n });
    return "none";
  } catch (e) {
    return toAppError(e).contractError ?? toAppError(e).code;
  }
}

const read = <T>(c: PublicClient, p: any, block?: bigint) => c.readContract({ ...p, ...(block ? { blockNumber: block } : {}) }) as Promise<T>;

let closeResult: StepResult | null = null;
let claimResult: StepResult | null = null;

async function main() {
  console.log(`deployer ${deployer.address}  trader ${trader.address}`);
  const dw = wallet(deployer);
  const tw = wallet(trader);

  // 1. Pool seed (LP deposit) from the public AUSD faucet.
  const idle = await read<bigint>(pc, { address: POOL, abi: imprestPoolAbi, functionName: "idleAssets" });
  if (idle < 2_000_000_000n) {
    if ((await read<bigint>(pc, { address: AUSD, abi: erc20Abi, functionName: "balanceOf", args: [deployer.address] })) < 5_200_000_000n) {
      await pc.waitForTransactionReceipt({ hash: await dw.writeContract({ address: FAUCET, abi: parseAbi(["function requestFunds(address)"]), functionName: "requestFunds", args: [deployer.address] }) });
    }
    await pc.waitForTransactionReceipt({ hash: await dw.writeContract({ address: AUSD, abi: erc20Abi, functionName: "approve", args: [POOL, 5_000_000_000n] }) });
    const before = await read<bigint>(vc, { address: POOL, abi: imprestPoolAbi, functionName: "idleAssets" });
    const r = await step("TESTNET_POOL_SEED", () => dw.writeContract({ address: POOL, abi: imprestPoolAbi, functionName: "deposit", args: [5_000_000_000n, deployer.address] }), { receiptStatus: "success", idleAssets: String(before + 5_000_000_000n) }, async (b) => ({ idleAssets: String(await read<bigint>(vc, { address: POOL, abi: imprestPoolAbi, functionName: "idleAssets" }, b)) }));
    await receiptFile(r, "pool_deposit", "LP seed from Agora testnet faucet AUSD.", { amount: "5000 AUSD" });
  }

  // 2. Trader gas + AUSD.
  if ((await pc.getBalance({ address: trader.address })) < 1_200_000_000_000_000_000n) {
    await pc.waitForTransactionReceipt({ hash: await dw.sendTransaction({ to: trader.address, value: 1_000_000_000_000_000_000n }) });
  }
  if ((await read<bigint>(pc, { address: AUSD, abi: erc20Abi, functionName: "balanceOf", args: [trader.address] })) < 200_000_000n) {
    // Transfer from the deployer's faucet AUSD rather than waiting out the faucet's global
    // 60 s frequency, which would also age Perpl's 60 s mark.
    if ((await read<bigint>(pc, { address: AUSD, abi: erc20Abi, functionName: "balanceOf", args: [deployer.address] })) < 200_000_000n) {
      await pc.waitForTransactionReceipt({ hash: await dw.writeContract({ address: FAUCET, abi: parseAbi(["function requestFunds(address)"]), functionName: "requestFunds", args: [deployer.address] }) });
    }
    await pc.waitForTransactionReceipt({ hash: await dw.writeContract({ address: AUSD, abi: parseAbi(["function transfer(address,uint256) returns (bool)"]), functionName: "transfer", args: [trader.address, 200_000_000n] }) });
  }

  // 3. Open an evaluation desk on the labeled demo cohort.
  const stake = 100_000_000n;
  await pc.waitForTransactionReceipt({ hash: await tw.writeContract({ address: AUSD, abi: erc20Abi, functionName: "approve", args: [FACTORY, stake] }) });
  const predicted = await read<Address>(pc, { address: FACTORY, abi: deskFactoryAbi, functionName: "predictDesk", args: [trader.address, 0n] });
  const open = await step(
    "TESTNET_DESK_OPEN",
    () => tw.writeContract({ address: FACTORY, abi: deskFactoryAbi, functionName: "openDesk", args: [stake, 0n] }),
    { receiptStatus: "success", deskTrader: trader.address.toLowerCase(), perplBalance: String(stake) },
    async (b) => ({
      deskTrader: (await read<Address>(vc, { address: predicted, abi: deskAbi, functionName: "trader" }, b)).toLowerCase(),
      perplBalance: String(((await read<any>(vc, { address: EX, abi: perplExchangeAbi, functionName: "getAccountByAddr", args: [predicted] }, b)) as any).balanceCNS),
    }),
    () => ({ desk: predicted }),
  );
  await receiptFile(open, "open_desk", "Desk opened its own Perpl testnet account with the full stake.", { stake: "100 AUSD", cohort: "demo-v0" });
  const desk = predicted;
  const accountId = await read<bigint>(pc, { address: desk, abi: deskAbi, functionName: "accountId" });
  const mark = async () => ((await read<any>(pc, { address: EX, abi: perplExchangeAbi, functionName: "getPosition", args: [BigInt(BTC.perpId), accountId] })) as any)[1] as bigint;

  // 4. Guarded order rejection: 6x sent DIRECTLY to Desk.trade(), no simulation, no UI.
  const m0 = await mark();
  const bad = { perpId: BigInt(BTC.perpId), side: 0, priceLimit: m0, lots: 100n, leverage: 600n, reduceOnly: false, fillOrKill: false };
  const rej = await step(
    "TESTNET_CANONICAL_GUARDED_REJECTION",
    () => tw.writeContract({ address: desk, abi: deskAbi, functionName: "trade", args: [bad as any], gas: 1_500_000n }),
    { receiptStatus: "reverted", lotsAfter: "0" },
    async (b) => ({ lotsAfter: String(((await read<any>(vc, { address: EX, abi: perplExchangeAbi, functionName: "getPosition", args: [BigInt(BTC.perpId), accountId] }, b)) as any)[0].lotLNS) }),
  );
  rej.outputs.revert = await revertName(rej.tx!);
  if (rej.outputs.revert !== "LeverageExceeded") rej.status = "PENDING";
  await receiptFile(rej, "direct_contract_rejection", "6.00x order sent straight to Desk.trade(); mined and reverted by the contract.", { order: { ...bad, perpId: String(bad.perpId), priceLimit: String(bad.priceLimit), lots: "100", leverage: "600" } });

  // 5. Premature graduation rejects itself onchain.
  const grad0 = await step(
    "TESTNET_PREMATURE_GRADUATION_REJECTED",
    () => tw.writeContract({ address: desk, abi: deskAbi, functionName: "graduate", gas: 1_500_000n }),
    { receiptStatus: "reverted", tier: "0" },
    async (b) => ({ tier: String(await read<number>(vc, { address: desk, abi: deskAbi, functionName: "tier" }, b)) }),
  );
  grad0.outputs.revert = await revertName(grad0.tx!);
  await receiptFile(grad0, "premature_graduation", "graduate() on an ineligible desk.", {});

  // 6. A real guarded trade against the live testnet book, then a reduce-only close.
  for (const [id, side, reduceOnly] of [["TESTNET_GUARDED_TRADE_OPEN", 0, false], ["TESTNET_GUARDED_TRADE_CLOSE", 1, true]] as const) {
    const mk = await mark();
    const lots = reduceOnly ? ((await read<any>(pc, { address: EX, abi: perplExchangeAbi, functionName: "getPosition", args: [BigInt(BTC.perpId), accountId] })) as any)[0].lotLNS as bigint : 100n;
    if (reduceOnly && lots === 0n) {
      console.log("no position to close (open did not fill): skipping the close step");
      break;
    }
    const o = { perpId: BigInt(BTC.perpId), side, priceLimit: side === 0 ? mk + (mk * 20n) / 10_000n : mk - (mk * 20n) / 10_000n, lots, leverage: 500n, reduceOnly, fillOrKill: false };
    let lotsAfterPrimary = "unknown";
    const r = await step(
      id,
      async () => {
        // explicit gas: a policy or venue refusal is mined and recorded, not hidden in estimation
        const h = await tw.writeContract({ address: desk, abi: deskAbi, functionName: "trade", args: [o as any], gas: 1_500_000n });
        const rc = await pc.waitForTransactionReceipt({ hash: h });
        for (const l of rc.logs) {
          try {
            const ev = decodeEventLog({ abi: deskAbi, data: l.data, topics: l.topics });
            if (ev.eventName === "TradeExecuted") lotsAfterPrimary = String((ev.args as any).lotsAfter);
          } catch {
            /* other */
          }
        }
        return h;
      },
      { receiptStatus: "success" },
      async (b) => ({ positionLotsOnVerifyRpc: String(((await read<any>(vc, { address: EX, abi: perplExchangeAbi, functionName: "getPosition", args: [BigInt(BTC.perpId), accountId] }, b)) as any)[0].lotLNS) }),
    );
    r.expected.positionLotsOnVerifyRpc = lotsAfterPrimary;
    r.status = r.observed.positionLotsOnVerifyRpc === lotsAfterPrimary && r.observed.receiptStatus === "success" ? OK_STATUS : "PENDING";
    if (r.observed.receiptStatus === "reverted") r.outputs.revert = await revertName(r.tx!);
    await receiptFile(r, "guarded_trade", "IOC order through the desk against Perpl's testnet book.", { order: { side, reduceOnly, lots: String(lots), leverage: "500", priceLimit: String(o.priceLimit) } });
  }

  // 7. Claim realized profit if (and only if) there is any; then close with verified payout.
  const rs: any = await read(pc, { address: desk, abi: deskAbi, functionName: "riskState" });
  if (rs.flat && rs.equity > rs.hwm) {
    const bal = await read<bigint>(vc, { address: AUSD, abi: erc20Abi, functionName: "balanceOf", args: [trader.address] });
    const gross: bigint = (rs.equity as bigint) - (rs.hwm as bigint); // evaluation tier: trader split 100%, no fees
    const c = await step("TESTNET_CANONICAL_CLAIM_PAID", () => tw.writeContract({ address: desk, abi: deskAbi, functionName: "claim" }), { receiptStatus: "success", traderBalance: String(bal + gross) }, async (b) => ({ traderBalance: String(await read<bigint>(vc, { address: AUSD, abi: erc20Abi, functionName: "balanceOf", args: [trader.address] }, b)) }), () => ({ gross: String(gross) }));
    await receiptFile(c, "claim", "Flat-only claim of realized profit above the HWM.", {});
    claimResult = c;
  } else {
    console.log("no realized profit above HWM: claim stays PENDING (not forced)");
  }
  const rs2: { equity: bigint } = await read(pc, { address: desk, abi: deskAbi, functionName: "riskState" });
  const bal2: bigint = await read<bigint>(vc, { address: AUSD, abi: erc20Abi, functionName: "balanceOf", args: [trader.address] });
  const close = await step(
    "TESTNET_DESK_CLOSE_PAYOUT",
    () => tw.writeContract({ address: desk, abi: deskAbi, functionName: "close" }),
    { receiptStatus: "success", status: "2", traderBalance: String(bal2 + (rs2.equity > 0n ? (rs2.equity as bigint) : 0n)) },
    async (b) => ({
      status: String(await read<number>(vc, { address: desk, abi: deskAbi, functionName: "status" }, b)),
      traderBalance: String(await read<bigint>(vc, { address: AUSD, abi: erc20Abi, functionName: "balanceOf", args: [trader.address] }, b)),
    }),
    () => ({ equityAtClose: String(rs2.equity) }),
  );
  await receiptFile(close, "close_desk", "Voluntary close of a flat evaluation desk; residual paid by contract, verified on the second RPC.", {});
  closeResult = close;

  // claims-input for the claims registry (only from verified receipts)
  mkdirSync(resolve(ROOT, "proof/claims-input"), { recursive: true });
  const asClaim = (r: StepResult, claimId: string, statement: string, value: string, unit: string): Claim => ({
    claim_id: claimId, statement, value: r.status === "TESTNET_VERIFIED" ? value : null, unit, network: "Monad Testnet", chain_id: net.chainId, contract: null,
    source: "scripts/src/testnet-demo.ts", evidence: [`proof/receipts/testnet/${r.id.toLowerCase()}.json`], transaction_hash: r.status === "TESTNET_VERIFIED" ? r.tx : null,
    block_number: r.status === "TESTNET_VERIFIED" ? r.block : null, timestamp_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), status: r.status,
    methodology: "Real testnet transaction; receipt and post-state read on an independent RPC at the receipt block", sample_size: 1, denominator: "one canonical run",
  });
  writeFileSync(resolve(ROOT, "proof/claims-input/TESTNET_CANONICAL_GUARDED_REJECTION.json"), JSON.stringify({ ...asClaim(rej, "TESTNET_CANONICAL_GUARDED_REJECTION", "An over-limit (6.00x) order sent directly to Desk.trade() on Monad testnet was mined and reverted by the contract with LeverageExceeded", String(rej.outputs.revert), "named contract error"), expected_tx_status: "reverted" }, null, 2));
  if (closeResult) {
    writeFileSync(
      resolve(ROOT, "proof/claims-input/TESTNET_CANONICAL_CLOSE_PAYOUT.json"),
      JSON.stringify(asClaim(closeResult, "TESTNET_CANONICAL_CLOSE_PAYOUT", "A flat desk was closed on Monad testnet and its residual AUSD was paid by contract; the trader's higher balance was read back on an independent RPC", `${String(closeResult.outputs.equityAtClose)} base units; ${closeResult.verifiedAt ? (closeResult.verifiedAt - closeResult.submittedAt) / 1000 : "?"} s submit-to-verified`, "AUSD base units"), null, 2),
    );
  }
  if (claimResult) {
    writeFileSync(
      resolve(ROOT, "proof/claims-input/TESTNET_CANONICAL_CLAIM_PAID.json"),
      JSON.stringify(asClaim(claimResult, "TESTNET_CANONICAL_CLAIM_PAID", "Realized profit claimed on Monad testnet and verified on an independent RPC", String(claimResult.outputs.gross), "AUSD base units"), null, 2),
    );
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
