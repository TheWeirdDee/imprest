/**
 * Read-only inventory of every Imprest desk on testnet. For each desk: owner, cohort, tier, status,
 * signed positions per market, equity (realized when flat), high-water mark, fees, closed round trips,
 * and whether claim() or graduate() would pass EVERY condition the contract checks right now.
 * Reads at one block from the independent (second) RPC; the money fields are re-read on the primary
 * RPC at the same block and must agree. No keys, no transactions.
 *
 *   pnpm --filter @imprest/scripts desk-inventory
 */
import { createPublicClient, http, type Address } from "viem";
import { accounting, deskAbi, deskFactoryAbi, getNetwork, imprestPoolAbi, perplExchangeAbi, toCohortPolicy } from "@imprest/core";

const net = getNetwork("testnet");
const second = createPublicClient({ transport: http(net.rpcUrls[1], { retryCount: 3 }) });
const primary = createPublicClient({ transport: http(net.rpcUrls[0], { retryCount: 3 }) });
const block = (await second.getBlockNumber()) - 2n;
const at = (c: typeof second) => <T>(address: Address, abi: any, functionName: string, args: unknown[] = []) =>
  c.readContract({ address, abi, functionName, args, blockNumber: block } as any) as Promise<T>;
const read = at(second);
const readP = at(primary);
const ts = Number((await second.getBlock({ blockNumber: block })).timestamp);
const f = (v: bigint | number) => (Number(v) / 1e6).toFixed(6);
const host = (u: string) => new URL(u).host;

const idle = await read<bigint>(net.imprest.pool!, imprestPoolAbi, "idleAssets");
const poolPaused = await read<boolean>(net.imprest.pool!, imprestPoolAbi, "paused");
const factoryPaused = await read<boolean>(net.imprest.factory!, deskFactoryAbi, "paused");
const total = await read<bigint>(net.imprest.factory!, deskFactoryAbi, "deskTotal");

const out: string[] = [];
const log = (s = "") => out.push(s);
log("# Desk inventory (testnet)\n");
log(`Block ${block} (${new Date(ts * 1000).toISOString()}), read on ${host(net.rpcUrls[1]!)}; money fields re-read on ${host(net.rpcUrls[0]!)} at the same block.`);
log(`Desks: ${total}. Pool idle: ${f(idle)} AUSD. Pool paused: ${poolPaused}. Factory paused: ${factoryPaused}.\n`);
log("Equity is the contract's riskState equity; it is realized equity only when the desk is flat. Fees accrue with time, so a claim or graduation re-checks them at execution.\n");

for (let i = 0n; i < total; i++) {
  const d = await read<Address>(net.imprest.factory!, deskFactoryAbi, "allDesks", [i]);
  const r: any = await read(d, deskAbi, "riskState");
  const rp: any = await readP(d, deskAbi, "riskState");
  const agree = ["equity", "hwm", "feeOutstanding", "borrowed", "status", "tier"].every((k) => String(r[k]) === String(rp[k]));
  const owner = await read<Address>(d, deskAbi, "trader");
  const p = toCohortPolicy(await read(d, deskAbi, "policy"));
  const accountId = await read<bigint>(d, deskAbi, "accountId");
  const tierStart = Number(await read<bigint>(d, deskAbi, "tierStartTs"));
  const claims = Number(await read<bigint>(d, deskAbi, "claimsThisTier"));
  const status = ["Active", "Enforcing", "Closed"][r.status] ?? String(r.status);
  const active = r.status === 0;

  const positions: string[] = [];
  for (const m of net.perpl.markets) {
    const pos: any = await read(net.perpl.exchange!, perplExchangeAbi, "getPosition", [BigInt(m.perpId), accountId]);
    const lots = BigInt(pos[0].lotLNS);
    const signed = Number(pos[0].positionType) === 0 ? lots : -lots;
    positions.push(`${m.symbol} ${signed === 0n ? "flat" : `${signed > 0n ? "+" : ""}${signed} lots (${signed > 0n ? "long" : "short"})`}`);
  }

  // claim(): active, flat, equity above HWM. Fees are netted from the gross first.
  const t = p.tiers[r.tier]!;
  const split = accounting.claimSplit(r.equity, r.hwm, r.feeOutstanding, BigInt(t.traderSplitBps), BigInt(t.protocolSplitBps));
  const claimWhy: string[] = [];
  if (!active) claimWhy.push(`desk ${status.toLowerCase()}`);
  if (!r.flat) claimWhy.push("positions open");
  if (split.gross === 0n) claimWhy.push(`equity ${f(r.equity)} not above HWM ${f(r.hwm)}`);
  const claimLine = claimWhy.length
    ? `no: ${claimWhy.join("; ")}`
    : `YES: gross ${f(split.gross)}, fees ${f(split.feesPaid)}, trader ${f(split.traderShare)}, protocol ${f(split.protocolShare)}, pool ${f(split.poolShare)}`;

  // graduate(): every check in Desk.graduate(), in the same order.
  let gradLine = "n/a (desk not active)";
  if (active && r.tier + 1 >= p.tierCount) gradLine = "no: top tier reached";
  else if (active) {
    const n = p.tiers[r.tier + 1]!;
    const target = (r.startEquity * BigInt(10_000 + n.gradProfitBps)) / 10_000n;
    const credit = r.originalStake * BigInt(n.sizeMultiple - 1) > r.borrowed ? r.originalStake * BigInt(n.sizeMultiple - 1) - r.borrowed : 0n;
    const why: string[] = [];
    if (poolPaused || factoryPaused) why.push("paused");
    if (!r.flat) why.push("positions open");
    if (r.equity < target) why.push(`equity ${f(r.equity)} < target ${f(target)} (+${n.gradProfitBps / 100}% on start ${f(r.startEquity)})`);
    if (r.closedTradesThisTier < BigInt(n.gradMinClosedTrades)) why.push(`closed round trips ${r.closedTradesThisTier} < ${n.gradMinClosedTrades}`);
    if (ts - tierStart < n.gradMinSeconds) why.push(`time in tier ${ts - tierStart}s < ${n.gradMinSeconds}s`);
    if (claims < n.gradMinClaims) why.push(`claims this tier ${claims} < ${n.gradMinClaims}`);
    if (r.feeOutstanding > 0n) why.push(`fees outstanding ${f(r.feeOutstanding)} > 0`);
    if (idle < credit) why.push(`pool idle ${f(idle)} < credit ${f(credit)}`);
    gradLine = why.length ? `no: ${why.join("; ")}` : `YES: credit ${f(credit)} AUSD`;
  }

  log(`## ${d}\n`);
  log(`| Field | Value |\n| --- | --- |`);
  log(`| Owner | \`${owner}\` |`);
  log(`| Cohort | ${p.name} |`);
  log(`| Tier | ${r.tier} of ${p.tierCount - 1} |`);
  log(`| Status | ${status} |`);
  log(`| Positions (signed) | ${positions.join("; ")} |`);
  log(`| Equity | ${f(r.equity)} AUSD${r.flat ? " (flat: realized)" : " (includes unrealized)"} |`);
  log(`| Start equity / HWM | ${f(r.startEquity)} / ${f(r.hwm)} |`);
  log(`| Borrowed | ${f(r.borrowed)} |`);
  log(`| Fees outstanding | ${f(r.feeOutstanding)} |`);
  log(`| Closed round trips this tier | ${r.closedTradesThisTier} |`);
  log(`| Claims this tier | ${claims} |`);
  log(`| Claim now | ${claimLine} |`);
  log(`| Graduate now | ${gradLine} |`);
  log(`| Second RPC agrees | ${agree ? "yes" : "NO: values differ between providers"} |\n`);
}
console.log(out.join("\n"));
