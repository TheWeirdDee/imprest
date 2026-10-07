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

/** Bounded fallback: scans at most `maxBlocks` recent blocks in small chunks. */
async function fromRpc(desk: Address, maxBlocks = 6_000n, chunk = 1_000n): Promise<{ events: DeskEvent[]; range: string }> {
  const pc = primaryClient();
  const head = await pc.getBlockNumber();
  const start = head > maxBlocks ? head - maxBlocks : 0n;
  const out: DeskEvent[] = [];
  for (let from = start; from <= head; from += chunk) {
    const to = from + chunk - 1n > head ? head : from + chunk - 1n;
    const logs = await pc.getLogs({ address: desk, fromBlock: from, toBlock: to });
    for (const l of logs) {
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
  return { events: out.sort((a, b) => Number(b.blockNumber - a.blockNumber)), range: `${start}-${head}` };
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
  return { source: "rpc-scan", scannedBlocks: r.range, events: r.events };
}
