/**
 * Read-only inventory of every Imprest desk on testnet: owner, cohort, tier, status, flat,
 * equity, high-water mark, fees, closed trades, and whether a claim or graduation is possible now.
 * Reads from the independent (second) RPC at one block. No keys, no transactions.
 *
 *   pnpm --filter @imprest/scripts desk-inventory
 */
import { createPublicClient, http, type Address } from "viem";
import { deskAbi, deskFactoryAbi, getNetwork, imprestPoolAbi, toCohortPolicy } from "@imprest/core";

const net = getNetwork("testnet");
const pc = createPublicClient({ transport: http(net.rpcUrls[1], { retryCount: 3 }) });
const block = await pc.getBlockNumber();
const read = <T>(address: Address, abi: any, functionName: string, args: unknown[] = []) =>
  pc.readContract({ address, abi, functionName, args, blockNumber: block } as any) as Promise<T>;
const f = (v: bigint) => (Number(v) / 1e6).toFixed(6);
const idle = await read<bigint>(net.imprest.pool!, imprestPoolAbi, "idleAssets");
const total = await read<bigint>(net.imprest.factory!, deskFactoryAbi, "deskTotal");
console.log(`# Desk inventory\n\nblock ${block}, rpc ${net.rpcUrls[1]}, desks ${total}, pool idle ${f(idle)} AUSD\n`);
console.log("| Desk | Owner | Cohort | Tier | Status | Flat | Equity | HWM | Fees | Closed trades | Claim now | Graduate now |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (let i = 0n; i < total; i++) {
  const d = await read<Address>(net.imprest.factory!, deskFactoryAbi, "allDesks", [i]);
  const r: any = await read(d, deskAbi, "riskState");
  const owner = await read<Address>(d, deskAbi, "trader");
  const p = toCohortPolicy(await read(d, deskAbi, "policy"));
  const next = r.tier + 1 < p.tierCount ? p.tiers[r.tier + 1] : null;
  const active = r.status === 0;
  const claim = active && r.flat && r.equity > r.hwm + r.feeOutstanding ? `YES: ${f(r.equity - r.hwm - r.feeOutstanding)} profit` : "no";
  let grad = "n/a";
  if (active && next) {
    const target = (r.startEquity * BigInt(10_000 + next.gradProfitBps)) / 10_000n;
    const credit = r.originalStake * BigInt(next.sizeMultiple - 1) - r.borrowed;
    const ok = r.flat && r.equity >= target && r.closedTradesThisTier >= BigInt(next.gradMinClosedTrades) && idle >= credit;
    grad = ok ? "YES" : `no (needs equity ≥ ${f(target)}, ${next.gradMinClosedTrades} closed trades, flat; pool idle ≥ ${f(credit)})`;
  } else if (active) grad = "n/a (top tier)";
  console.log(`| \`${d}\` | \`${owner}\` | ${p.name} | ${r.tier} | ${["Active", "Enforcing", "Closed"][r.status]} | ${r.flat ? "yes" : "no"} | ${f(r.equity)} | ${f(r.hwm)} | ${f(r.feeOutstanding)} | ${r.closedTradesThisTier} | ${claim} | ${grad} |`);
}
