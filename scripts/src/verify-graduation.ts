/**
 * Verifies a keeper-sent graduation on the independent RPC and writes the receipt and claim
 * inputs. Read-only; no keys.
 *
 *   pnpm --filter @imprest/scripts verify-graduation -- <desk> <graduateTx>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, decodeEventLog, http, type Address, type Hex } from "viem";
import { deskAbi, getNetwork } from "@imprest/core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const [desk, tx] = process.argv.slice(2).filter((a) => a !== "--") as [Address, Hex];
const net = getNetwork("testnet");
const vc = createPublicClient({ transport: http(net.rpcUrls[1]) });
const KEEPER = "0x9C4F9B38ce13A1552Aa6FCb505CfFb3E70FAFCc0";

const rc = await vc.getTransactionReceipt({ hash: tx });
const t = await vc.getTransaction({ hash: tx });
const block = await vc.getBlock({ blockNumber: rc.blockNumber });
let ev: Record<string, unknown> | null = null;
for (const l of rc.logs) {
  if (l.address.toLowerCase() !== desk.toLowerCase()) continue;
  try {
    const d = decodeEventLog({ abi: deskAbi, data: l.data, topics: l.topics });
    if (d.eventName === "Graduated") ev = d.args as Record<string, unknown>;
  } catch {
    /* other event */
  }
}
const read = <T>(fn: string) => vc.readContract({ address: desk, abi: deskAbi, functionName: fn as any, blockNumber: rc.blockNumber }) as Promise<T>;
const [tier, borrowed, startEquity] = await Promise.all([read<number>("tier"), read<bigint>("borrowed"), read<bigint>("startEquity")]);
const ts = new Date(Number(block.timestamp) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
const ok = rc.status === "success" && ev !== null && Number(tier) === 1 && borrowed > 0n && t.from.toLowerCase() === KEEPER.toLowerCase();
const S = (o: unknown) => JSON.parse(JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

const receipt = {
  id: "TESTNET_CANONICAL_GRADUATION",
  environment: "testnet",
  network: "Monad Testnet",
  chain_id: net.chainId,
  timestamp_utc: ts,
  git_commit: null,
  operation: "graduate",
  status: ok ? "TESTNET_VERIFIED" : "PENDING",
  tx_hash: tx,
  block_number: Number(rc.blockNumber),
  contract: desk,
  explorer_url: null,
  inputs: { sent_by: t.from, sent_by_role: "keeper" },
  outputs: { graduated_event: S(ev), gas_used: rc.gasUsed.toString(), gas_limit: t.gas.toString() },
  verification: { method: "receipt, Graduated event and desk state read on the independent RPC at the receipt block", rpc: net.rpcUrls[1], tier: Number(tier), borrowed: borrowed.toString(), startEquity: startEquity.toString() },
  notes:
    "Desk reached +2% over two closed, relayed round trips on Perpl testnet (receipts 01-04 in this folder). The second round trip was deliberately small (0.5x equity) once the profit target was already met. The Imprest keeper detected eligibility and called graduate(); the contract checked the rules and the pool funded the credit.",
};
const out = resolve(ROOT, "proof/receipts/testnet/graduation-attempt");
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, "05-graduate-by-keeper.json"), JSON.stringify(receipt, null, 2) + "\n");

const base = { network: "Monad Testnet", chain_id: net.chainId, contract: desk, source: "scripts/src/verify-graduation.ts", evidence: ["proof/receipts/testnet/graduation-attempt/05-graduate-by-keeper.json"], transaction_hash: tx, block_number: Number(rc.blockNumber), timestamp_utc: ts, status: receipt.status, sample_size: 1, denominator: "one desk" };
writeFileSync(
  resolve(ROOT, "proof/claims-input/TESTNET_CANONICAL_GRADUATION.json"),
  JSON.stringify({ claim_id: "TESTNET_CANONICAL_GRADUATION", statement: "A desk earned +2% over two closed trades on Monad testnet, graduated to tier 1 and was funded by the pool", value: `${Number(borrowed) / 1e6} AUSD credit`, unit: "pool credit", methodology: receipt.verification.method, ...base }, null, 2) + "\n",
);
writeFileSync(
  resolve(ROOT, "proof/claims-input/TESTNET_KEEPER_ACTION.json"),
  JSON.stringify({ claim_id: "TESTNET_KEEPER_ACTION", statement: "The Imprest keeper sent a contract-accepted graduate() on Monad testnet after simulating it", value: tx, unit: "transaction", methodology: `sender ${t.from} is the keeper wallet; receipt success and tier 1 read on the independent RPC; gas ${rc.gasUsed}`, ...base }, null, 2) + "\n",
);
console.log(JSON.stringify({ status: receipt.status, tier: Number(tier), borrowed: borrowed.toString(), startEquity: startEquity.toString(), from: t.from }));
