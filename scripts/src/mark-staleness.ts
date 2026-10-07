/**
 * Samples Perpl mark-price age on a network over recent blocks (read-only), to measure
 * how often a desk would see markPriceValid=false (age > refPriceMaxAgeSec).
 *   tsx src/mark-staleness.ts testnet 120 10   -> 120 samples, every 10 blocks
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, type Address } from "viem";
import { allNetworks, perplExchangeAbi } from "@imprest/core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const env = (process.argv[2] ?? "testnet") as "testnet" | "mainnet";
const samples = Number(process.argv[3] ?? 120);
const stride = BigInt(process.argv[4] ?? 10);
const net = allNetworks()[env];
const client = createPublicClient({ transport: http(net.rpcUrls[0], { retryCount: 3 }) });

async function main() {
  const head = await client.getBlockNumber();
  const rows: { block: string; ts: number; perp: number; ageSec: number; maxAge: number; stale: boolean }[] = [];
  for (let i = 0; i < samples; i++) {
    const bn = head - BigInt(i) * stride;
    const blk = await client.getBlock({ blockNumber: bn });
    for (const m of net.perpl.markets) {
      const info: any = await client.readContract({
        address: net.perpl.exchange as Address,
        abi: perplExchangeAbi as any,
        functionName: "getPerpetualInfo",
        args: [BigInt(m.perpId)],
        blockNumber: bn,
      });
      const age = Number(blk.timestamp) - Number(info.markTimestamp);
      rows.push({ block: bn.toString(), ts: Number(blk.timestamp), perp: m.perpId, ageSec: age, maxAge: Number(info.refPriceMaxAgeSec), stale: age > Number(info.refPriceMaxAgeSec) });
    }
  }
  const by = (p: number) => rows.filter((r) => r.perp === p);
  const summary = net.perpl.markets.map((m) => {
    const r = by(m.perpId);
    const ages = r.map((x) => x.ageSec).sort((a, b) => a - b);
    return {
      market: m.symbol,
      perpId: m.perpId,
      samples: r.length,
      stale_samples: r.filter((x) => x.stale).length,
      stale_fraction: r.filter((x) => x.stale).length / r.length,
      median_age_sec: ages[Math.floor(ages.length / 2)],
      max_age_sec: ages[ages.length - 1],
    };
  });
  const first = rows[rows.length - 1]!, last = rows[0]!;
  const out = {
    id: `MARK_STALENESS_${env.toUpperCase()}`,
    environment: env,
    status: env === "mainnet" ? "MAINNET_VERIFIED" : "TESTNET_VERIFIED",
    method: "read-only eth_call getPerpetualInfo at sampled historical blocks; age = block.timestamp - markTimestamp",
    window: { from_block: first.block, to_block: last.block, from_ts: first.ts, to_ts: last.ts, stride_blocks: stride.toString() },
    rpc: net.rpcUrls[0],
    generated_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    summary,
    rows,
  };
  mkdirSync(resolve(ROOT, "proof/experiments"), { recursive: true });
  writeFileSync(resolve(ROOT, `proof/experiments/mark-staleness-${env}.json`), JSON.stringify(out, null, 2));
  // Receipt form of the same read-only observation, for the claims registry.
  mkdirSync(resolve(ROOT, `proof/receipts/${env}`), { recursive: true });
  const receipt = {
    id: out.id,
    environment: env,
    network: env === "mainnet" ? "Monad Mainnet" : "Monad Testnet",
    chain_id: net.chainId,
    timestamp_utc: out.generated_utc,
    git_commit: null,
    operation: "perpl_mark_age_sample",
    status: out.status,
    tx_hash: null,
    block_number: Number(last.block),
    contract: net.perpl.exchange,
    explorer_url: null,
    inputs: { samples, stride_blocks: stride.toString(), rpc: net.rpcUrls[0] },
    outputs: { summary },
    verification: { method: out.method, full_rows: `proof/experiments/mark-staleness-${env}.json` },
    notes: "Read-only historical eth_calls; no transaction.",
  };
  writeFileSync(resolve(ROOT, `proof/receipts/${env}/mark-staleness.json`), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(summary, null, 1));
}
main();
