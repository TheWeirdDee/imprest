/**
 * Honest graduation attempt on Monad testnet. Real IOC orders on Perpl's live book, sent as
 * trader-signed EIP-712 intents through the running relayer. No threshold, accounting or
 * storage is touched; if the market does not give +2% the result is reported as pending.
 *
 * Graduation itself is NOT called here: the running keeper must do it when the contract
 * says the desk is eligible (proves a real keeper action).
 *
 *   pnpm --filter @imprest/scripts graduation-attempt
 *
 * Risk limits (demo cohort, 100 AUSD stake): daily floor 97, trading floor 94. This script
 * stops at 98.5 so it can never breach. Each round trip uses 3x notional.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, decodeEventLog, defineChain, fallback, http, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deskAbi, deskDomain, deskFactoryAbi, erc20Abi, getNetwork, perplExchangeAbi, toWire, tradeIntentTypes, type OrderIntent, type RiskState } from "@imprest/core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const net = getNetwork("testnet");
const RELAYER = process.env.RELAYER_URL ?? "http://localhost:8787";
const KEEPER = process.env.KEEPER_HEALTH_URL ?? "http://localhost:8788";
const chain = defineChain({ id: net.chainId, name: "Monad Testnet", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [net.rpcUrls[0]!] } } });
const pc = createPublicClient({ chain, transport: fallback([http(net.rpcUrls[0], { retryCount: 3, timeout: 20_000 }), http(net.rpcUrls[1], { retryCount: 3, timeout: 20_000 })]) }) as PublicClient;
const vc = createPublicClient({ chain, transport: http(net.rpcUrls[1]) }) as PublicClient;
const trader = privateKeyToAccount(readFileSync(resolve(ROOT, ".secrets/testnet-trader.key"), "utf8").trim() as Hex);
const tw = createWalletClient({ chain, account: trader, transport: http(net.rpcUrls[0]) });
const BTC = net.perpl.markets.find((m) => m.symbol === "BTC")!;
const OUT = resolve(ROOT, "proof/receipts/testnet/graduation-attempt");
mkdirSync(OUT, { recursive: true });

const STAKE = 100_000_000n;
const STOP_EQUITY = 98_500_000n; // well above the 97 daily floor
const TAKE_PROFIT = 1_300_000n; // per round trip, base units
const STOP_LOSS = 900_000n;
const MAX_ROUND_TRIPS = 8;
const MAX_MS = 4 * 3600_000;
const LEVERAGE = 300n;

const STATE = resolve(OUT, "state.json");
const loadEntry = (): bigint | null => (existsSync(STATE) ? BigInt(JSON.parse(readFileSync(STATE, "utf8")).entryEquity) : null);
const saveEntry = (v: bigint) => writeFileSync(STATE, JSON.stringify({ entryEquity: v.toString() }));
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ ts: now(), ...o }, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rd = <T>(c: PublicClient, p: any, b?: bigint) => c.readContract({ ...p, ...(b ? { blockNumber: b } : {}) }) as Promise<T>;

async function ensureDesk(): Promise<Address> {
  const desks = await rd<readonly Address[]>(pc, { address: net.imprest.factory!, abi: deskFactoryAbi, functionName: "getDesks", args: [trader.address] });
  for (const d of [...desks].reverse()) {
    if (Number(await rd<number>(pc, { address: d, abi: deskAbi, functionName: "status" })) === 0) return d;
  }
  log({ step: "open_desk", stake: STAKE });
  await pc.waitForTransactionReceipt({ hash: await tw.writeContract({ address: net.perpl.collateralToken!, abi: erc20Abi, functionName: "approve", args: [net.imprest.factory!, STAKE] }) });
  const predicted = await rd<Address>(pc, { address: net.imprest.factory!, abi: deskFactoryAbi, functionName: "predictDesk", args: [trader.address, 0n] });
  const hash = await tw.writeContract({ address: net.imprest.factory!, abi: deskFactoryAbi, functionName: "openDesk", args: [STAKE, 0n] });
  const rc = await pc.waitForTransactionReceipt({ hash });
  writeFileSync(resolve(OUT, `desk-open-${rc.blockNumber}.json`), JSON.stringify({ id: "TESTNET_GRADUATION_ATTEMPT_DESK_OPEN", environment: "testnet", network: "Monad Testnet", chain_id: net.chainId, timestamp_utc: now(), git_commit: null, operation: "open_desk", status: rc.status === "success" ? "TESTNET_VERIFIED" : "PENDING", tx_hash: hash, block_number: Number(rc.blockNumber), contract: predicted, explorer_url: null, inputs: { stake: STAKE.toString(), cohort: "demo-v0" }, outputs: {}, verification: { method: "receipt on primary RPC", receiptStatus: rc.status }, notes: "Desk for the honest graduation attempt." }, null, 2));
  return predicted;
}

async function mark(accountId: bigint): Promise<{ pns: bigint; valid: boolean; lots: bigint; isLong: boolean }> {
  const r = (await rd<any>(pc, { address: net.perpl.exchange!, abi: perplExchangeAbi as any, functionName: "getPosition", args: [BigInt(BTC.perpId), accountId] })) as [any, bigint, boolean];
  return { pns: r[1], valid: r[2], lots: r[0].lotLNS as bigint, isLong: Number(r[0].positionType) === 0 };
}

/** Recent drift from Perpl 1m candles; used only to pick a direction. */
async function drift(): Promise<number> {
  const to = Date.now();
  const r = await fetch(`${net.perpl.apiUrl}/v1/market-data/${BTC.perpId}/candles/60/${to - 30 * 60_000}-${to}`);
  const d = ((await r.json())?.d ?? []) as { c: number }[];
  if (d.length < 10) return 0;
  const last = d[d.length - 1]!.c;
  const avg = d.slice(-20).reduce((a, x) => a + x.c, 0) / Math.min(20, d.length);
  return (last - avg) / avg;
}

let seq = existsSync(OUT) ? readdirSync(OUT).filter((f) => /^\d\d-/.test(f)).length : 0;
async function relay(desk: Address, accountId: bigint, o: OrderIntent, label: string) {
  const last = await rd<bigint>(pc, { address: desk, abi: deskAbi, functionName: "lastNonce" });
  const nonce = last + 1n;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 120);
  const signature = await trader.signTypedData({ domain: deskDomain(net.chainId, desk), types: tradeIntentTypes, primaryType: "TradeIntent", message: { ...o, nonce, deadline } });
  const res = await fetch(`${RELAYER}/v1/intents`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(toWire(net.chainId, desk, o, nonce, deadline, signature)) });
  const j = await res.json();
  if (res.status !== 202) {
    log({ step: label, relayer_status: res.status, error: j.error, code: j.code });
    return null;
  }
  const hash = j.txHash as Hex;
  const rc = await pc.waitForTransactionReceipt({ hash, timeout: 90_000 });
  let lotsAfter: string | null = null;
  for (const l of rc.logs) {
    try {
      const ev = decodeEventLog({ abi: deskAbi, data: l.data, topics: l.topics });
      if (ev.eventName === "TradeExecuted") lotsAfter = String((ev.args as any).lotsAfter);
    } catch {
      /* other */
    }
  }
  for (let i = 0; i < 60 && (await vc.getBlockNumber()) < rc.blockNumber; i++) await sleep(500);
  const v = (await rd<any>(vc, { address: net.perpl.exchange!, abi: perplExchangeAbi as any, functionName: "getPosition", args: [BigInt(BTC.perpId), accountId] }, rc.blockNumber)) as any;
  const verified = rc.status === "success" && lotsAfter !== null && String(v[0].lotLNS) === lotsAfter;
  seq++;
  writeFileSync(
    resolve(OUT, `${String(seq).padStart(2, "0")}-${label}.json`),
    JSON.stringify({ id: `TESTNET_RELAYED_${label.toUpperCase()}_${seq}`, environment: "testnet", network: "Monad Testnet", chain_id: net.chainId, timestamp_utc: now(), git_commit: null, operation: "relayed_trade", status: verified ? "TESTNET_VERIFIED" : "PENDING", tx_hash: hash, block_number: Number(rc.blockNumber), contract: desk, explorer_url: null, inputs: { side: o.side, lots: o.lots.toString(), leverage: o.leverage.toString(), priceLimit: o.priceLimit.toString(), reduceOnly: o.reduceOnly, nonce: nonce.toString(), submitted_by: "relayer" }, outputs: { relayer_gas: j.gas, lotsAfterPrimary: lotsAfter }, verification: { method: "position read on the independent RPC at the receipt block", lotsOnVerifyRpc: String(v[0].lotLNS) }, notes: "Trader-signed EIP-712 intent submitted by the Imprest relayer." }, null, 2),
  );
  log({ step: label, tx: hash, block: rc.blockNumber, lotsAfter, verified });
  return lotsAfter;
}

async function main() {
  const t0 = Date.now();
  const desk = await ensureDesk();
  log({ desk, trader: trader.address });
  let trips = 0;
  let entryEquity: bigint | null = loadEntry();
  while (Date.now() - t0 < MAX_MS) {
    try {
    const r = (await rd<RiskState>(pc, { address: desk, abi: deskAbi, functionName: "riskState" })) as RiskState;
    if (r.tier >= 1) {
      log({ result: "GRADUATED", tier: r.tier, borrowed: r.borrowed });
      break;
    }
    const m = await mark(r.accountId);
    const target = (r.startEquity * 10_200n) / 10_000n;
    if (r.flat) {
      if (r.equity >= target && r.closedTradesThisTier >= 2n) {
        log({ step: "eligible", equity: r.equity, waiting_for: "keeper to call graduate()" });
        const keeperBefore = await fetch(KEEPER).then((x) => x.json()).catch(() => null);
        for (let i = 0; i < 60; i++) {
          await sleep(5000);
          const tier = await rd<number>(pc, { address: desk, abi: deskAbi, functionName: "tier" });
          if (Number(tier) >= 1) break;
        }
        const keeperAfter = await fetch(KEEPER).then((x) => x.json()).catch(() => null);
        log({ step: "keeper", before: keeperBefore?.actionsSent, after: keeperAfter?.actionsSent });
        continue;
      }
      if (r.equity <= STOP_EQUITY || trips >= MAX_ROUND_TRIPS) {
        log({ result: "STOPPED", reason: r.equity <= STOP_EQUITY ? "loss budget reached" : "max round trips", equity: r.equity, trips });
        break;
      }
      const relayerHealth = await fetch(`${RELAYER}/health`).then((x) => x.json()).catch(() => null);
      if (!relayerHealth || BigInt(relayerHealth.balanceWei) < 250_000_000_000_000_000n) {
        log({ result: "STOPPED", reason: "relayer gas budget below one round trip (0.25 MON)", relayerBalanceWei: relayerHealth?.balanceWei ?? null, equity: r.equity, trips });
        break;
      }
      if (!m.valid) {
        await sleep(10_000);
        continue;
      }
      const dr = await drift();
      const side: 0 | 1 = dr >= 0 ? 0 : 1;
      const notional = (r.equity * LEVERAGE) / 100n; // AUSD base units
      const lots = (notional * 10n ** BigInt(BTC.priceDecimals + BTC.lotDecimals)) / (m.pns * 1_000_000n);
      const price = side === 0 ? m.pns + (m.pns * 20n) / 10_000n : m.pns - (m.pns * 20n) / 10_000n;
      entryEquity = r.equity;
      saveEntry(r.equity);
      log({ step: "open", side: side === 0 ? "long" : "short", drift: dr, lots, equity: r.equity });
      await relay(desk, r.accountId, { perpId: BigInt(BTC.perpId), side, priceLimit: price, lots, leverage: LEVERAGE, reduceOnly: false, fillOrKill: false }, "open");
    } else {
      const pnl = r.equity - (entryEquity ?? r.equity);
      if (pnl >= TAKE_PROFIT || pnl <= -STOP_LOSS || r.equity <= STOP_EQUITY + 200_000n || !entryEquity) {
        const side: 0 | 1 = m.isLong ? 1 : 0;
        const price = side === 1 ? m.pns - (m.pns * 20n) / 10_000n : m.pns + (m.pns * 20n) / 10_000n;
        log({ step: "close", pnl, equity: r.equity });
        await relay(desk, r.accountId, { perpId: BigInt(BTC.perpId), side, priceLimit: price, lots: m.lots, leverage: LEVERAGE, reduceOnly: true, fillOrKill: false }, "close");
        trips++;
      }
    }
    } catch (e) {
      log({ step: "loop_error", error: (e as Error).message.split("\n")[0] });
    }
    await sleep(8000);
  }
  const r = (await rd<RiskState>(pc, { address: desk, abi: deskAbi, functionName: "riskState" })) as RiskState;
  const summary = { desk, tier: r.tier, equity: r.equity.toString(), startEquity: r.startEquity.toString(), closedTrades: r.closedTradesThisTier.toString(), flat: r.flat, roundTrips: trips, finished_utc: now() };
  writeFileSync(resolve(OUT, "summary.json"), JSON.stringify(summary, null, 2));
  log({ done: summary });
}

main().catch((e) => {
  log({ fatal: (e as Error).message });
  process.exit(1);
});
