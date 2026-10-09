"use client";

import { decodeEventLog, type Address, type Hex } from "viem";
import { deskAbi } from "@imprest/core";
import { primaryClient } from "./chain";
import { indexerUrl } from "./env";

export interface DeskEvent {
  kind: "Trade" | "Graduated" | "Claimed" | "Settled" | "EnforcementStarted" | "FeesAccrued" | "PartialClose" | "DeskActivated";
  txHash: Hex;
  blockNumber: bigint;
  args: Record<string, unknown>;
}

export interface HistoryResult {
  source: "indexer" | "rpc-scan";
  scannedBlocks?: string;
  /** Block chunks that could not be read even after a retry (results are partial). */
  missedChunks?: number;
  /** Unix time (s) of the first scanned block, so the UI can say how far back the scan reaches. */
  scannedSince?: number;
  events: DeskEvent[];
}

const KINDS = new Set(["TradeExecuted", "Graduated", "Claimed", "Settled", "EnforcementStarted", "FeesAccrued", "PartialClose", "DeskActivated"]);

async function fromIndexer(desk: Address): Promise<DeskEvent[]> {
  const q = `query($desk: String!) {
    DeskEvent(where: {desk_id: {_eq: $desk}}, order_by: {blockNumber: desc}, limit: 100) {
      kind txHash blockNumber argsJson
    }
  }`;
  const r = await fetch(indexerUrl!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: q, variables: { desk: desk.toLowerCase() } }),
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(`indexer ${r.status}`);
  const j = await r.json();
  if (j.errors) throw new Error(j.errors[0]?.message ?? "indexer error");
  return (j.data?.DeskEvent ?? []).map((e: any) => ({
    kind: e.kind,
    txHash: e.txHash,
    blockNumber: BigInt(e.blockNumber),
    args: JSON.parse(e.argsJson ?? "{}"),
  }));
}

/**
 * Bounded fallback: scans at most `maxBlocks` recent blocks. Monad's public RPC rejects
 * eth_getLogs ranges over 100 blocks, so the scan uses 100-block chunks, a few at a time.
 */
async function fromRpc(desk: Address, maxBlocks = 5_000n, chunk = 100n, parallel = 5): Promise<{ events: DeskEvent[]; range: string; missed: number; since?: number }> {
  const pc = primaryClient();
  const head = await pc.getBlockNumber();
  const start = head > maxBlocks ? head - maxBlocks + 1n : 0n;
  const ranges: [bigint, bigint][] = [];
  for (let from = start; from <= head; from += chunk) ranges.push([from, from + chunk - 1n > head ? head : from + chunk - 1n]);
  const out: DeskEvent[] = [];
  let missed = 0;
  // One retry per chunk; a chunk that still fails is counted, not fatal (public RPCs rate-limit).
  const read = async (fromBlock: bigint, toBlock: bigint) => {
    try {
      return await pc.getLogs({ address: desk, fromBlock, toBlock });
    } catch {
      try {
        return await pc.getLogs({ address: desk, fromBlock, toBlock });
      } catch {
        missed++;
        return [];
      }
    }
  };
  for (let i = 0; i < ranges.length; i += parallel) {
    const batch = await Promise.all(ranges.slice(i, i + parallel).map(([fromBlock, toBlock]) => read(fromBlock, toBlock)));
    for (const l of batch.flat()) {
      try {
        const ev = decodeEventLog({ abi: deskAbi, data: l.data, topics: l.topics });
        if (!KINDS.has(ev.eventName)) continue;
        out.push({
          kind: ev.eventName === "TradeExecuted" ? "Trade" : (ev.eventName as DeskEvent["kind"]),
          txHash: l.transactionHash!,
          blockNumber: l.blockNumber!,
          args: ev.args as Record<string, unknown>,
        });
      } catch {
        /* not a desk event we display */
      }
    }
  }
  if (missed === ranges.length) throw new Error("the RPC did not return any block range");
  const since = await pc
    .getBlock({ blockNumber: start })
    .then((b) => Number(b.timestamp))
    .catch(() => undefined);
  return { events: out.sort((a, b) => Number(b.blockNumber - a.blockNumber)), range: `${start}-${head}`, missed, since };
}

export async function deskHistory(desk: Address): Promise<HistoryResult> {
  if (indexerUrl) {
    try {
      return { source: "indexer", events: await fromIndexer(desk) };
    } catch {
      /* fall through to the bounded RPC scan */
    }
  }
  const r = await fromRpc(desk);
  return { source: "rpc-scan", scannedBlocks: r.range, missedChunks: r.missed, scannedSince: r.since, events: r.events };
}
