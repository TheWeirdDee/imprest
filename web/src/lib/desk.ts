"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import {
  deskAbi,
  deskFactoryAbi,
  erc20Abi,
  imprestPoolAbi,
  perplExchangeAbi,
  toCohortPolicy,
  type CohortPolicy,
  type RiskState,
} from "@imprest/core";
import { primaryClient, verifyClient } from "./chain";
import { deployed, network } from "./env";

export interface Loadable<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  updatedAt: number | null;
  refresh: () => void;
}

/** Polls `fn` while the tab is visible. Bounded interval; no unbounded subscriptions. */
export function usePoll<T>(fn: (() => Promise<T>) | null, ms: number, key: string): Loadable<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(fn));
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const tick = useCallback(async () => {
    const f = fnRef.current;
    if (!f) return;
    try {
      const v = await f();
      setData(v);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!fn) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void tick();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void tick();
    }, ms);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ms]);
  return { data, error, loading, updatedAt, refresh: () => void tick() };
}

export function useBalances(address: Address | null) {
  return usePoll(
    address && network.perpl.collateralToken
      ? async () => {
          const pc = primaryClient();
          const [ausd, native] = await Promise.all([
            pc.readContract({ address: network.perpl.collateralToken!, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
            pc.getBalance({ address }),
          ]);
          return { ausd: ausd as bigint, native };
        }
      : null,
    6000,
    `bal:${address}`,
  );
}

/** The trader's most recent desk from the factory (authoritative chain read). */
export function useTraderDesk(address: Address | null) {
  return usePoll(
    address && deployed
      ? async () => {
          const desks = (await primaryClient().readContract({
            address: network.imprest.factory!,
            abi: deskFactoryAbi,
            functionName: "getDesks",
            args: [address],
          })) as readonly Address[];
          return { all: desks, current: desks.length ? desks[desks.length - 1]! : null };
        }
      : null,
    8000,
    `desk:${address}`,
  );
}

export function useRiskState(desk: Address | null) {
  return usePoll(
    desk
      ? async () => (await primaryClient().readContract({ address: desk, abi: deskAbi, functionName: "riskState" })) as unknown as RiskState
      : null,
    4000,
    `risk:${desk}`,
  );
}

const policyCache = new Map<string, CohortPolicy>();

export function usePolicy(desk: Address | null) {
  return usePoll(
    desk
      ? async () => {
          const hit = policyCache.get(desk);
          if (hit) return hit;
          const raw = await primaryClient().readContract({ address: desk, abi: deskAbi, functionName: "policy" });
          const p = toCohortPolicy(raw);
          policyCache.set(desk, p);
          return p;
        }
      : null,
    60_000,
    `policy:${desk}`,
  );
}

export function useCohorts() {
  return usePoll(
    deployed
      ? async () => {
          const pc = primaryClient();
          const n = (await pc.readContract({ address: network.imprest.factory!, abi: deskFactoryAbi, functionName: "cohortCount" })) as bigint;
          const ids = Array.from({ length: Number(n) }, (_, i) => BigInt(i));
          const out = await Promise.all(
            ids.map(async (i) => {
              const [raw, active] = await Promise.all([
                pc.readContract({ address: network.imprest.factory!, abi: deskFactoryAbi, functionName: "getCohort", args: [i] }),
                pc.readContract({ address: network.imprest.factory!, abi: deskFactoryAbi, functionName: "cohortActive", args: [i] }),
              ]);
              return { id: Number(i), active: active as boolean, policy: toCohortPolicy(raw) };
            }),
          );
          return out;
        }
      : null,
    120_000,
    "cohorts",
  );
}

export interface PositionView {
  perpId: number;
  symbol: string;
  lots: bigint;
  isLong: boolean;
  entryPns: bigint;
  depositCNS: bigint;
  deltaPnlCNS: bigint;
  premiumPnlCNS: bigint;
  markPns: bigint;
  markValid: boolean;
}

export function usePositions(accountId: bigint | null, key: string) {
  return usePoll(
    accountId && network.perpl.exchange
      ? async () => {
          const pc = primaryClient();
          const rows = await Promise.all(
            network.perpl.markets.map(async (m) => {
              const r = (await pc.readContract({
                address: network.perpl.exchange!,
                abi: perplExchangeAbi as any,
                functionName: "getPosition",
                args: [BigInt(m.perpId), accountId],
              })) as any;
              const [p, mark, valid] = r as [any, bigint, boolean];
              return {
                perpId: m.perpId,
                symbol: m.symbol,
                lots: p.lotLNS as bigint,
                isLong: Number(p.positionType) === 0,
                entryPns: p.pricePNS as bigint,
                depositCNS: p.depositCNS as bigint,
                deltaPnlCNS: p.deltaPnlCNS as bigint,
                premiumPnlCNS: p.premiumPnlCNS as bigint,
                markPns: mark,
                markValid: valid,
              } satisfies PositionView;
            }),
          );
          return rows;
        }
      : null,
    4000,
    `pos:${accountId}:${key}`,
  );
}

export interface PoolView {
  totalAssets: bigint;
  idle: bigint;
  deployed: bigint;
  principalLoss: bigint;
  feesCollected: bigint;
  feesWrittenOff: bigint;
  profitShare: bigint;
  lpDeposited: bigint;
  lpWithdrawn: bigint;
  deskNotionalCap: bigint;
  paused: boolean;
  exposure: { perpId: number; symbol: string; gross: bigint; cap: bigint }[];
  deskTotal: bigint;
  /** Money values read again from the independent RPC at the same block. */
  confirmedOnSecondRpc: boolean | null;
  blockNumber: bigint;
}

async function readPool(client: ReturnType<typeof primaryClient>, blockNumber: bigint) {
  const pool = network.imprest.pool!;
  const r = (fn: string, args: unknown[] = []) =>
    client.readContract({ address: pool, abi: imprestPoolAbi, functionName: fn as any, args: args as any, blockNumber }) as Promise<any>;
  const [totalAssets, idle, dep, loss, fees, wo, share, lpIn, lpOut, deskCap, paused] = await Promise.all([
    r("totalAssets"),
    r("idleAssets"),
    r("deployedPrincipal"),
    r("totalPrincipalLoss"),
    r("totalFeesCollected"),
    r("totalFeesWrittenOff"),
    r("totalProfitShare"),
    r("lpDeposited"),
    r("lpWithdrawn"),
    r("deskNotionalCap"),
    r("paused"),
  ]);
  const exposure = await Promise.all(
    network.perpl.markets.map(async (m) => ({
      perpId: m.perpId,
      symbol: m.symbol,
      gross: (await r("grossExposure", [BigInt(m.perpId)])) as bigint,
      cap: (await r("grossCap", [BigInt(m.perpId)])) as bigint,
    })),
  );
  return { totalAssets, idle, deployed: dep, principalLoss: loss, feesCollected: fees, feesWrittenOff: wo, profitShare: share, lpDeposited: lpIn, lpWithdrawn: lpOut, deskNotionalCap: deskCap, paused, exposure };
}

export function usePool() {
  return usePoll<PoolView>(
    deployed
      ? async () => {
          const pc = primaryClient();
          const blockNumber = (await pc.getBlockNumber()) - 2n;
          const a = await readPool(pc, blockNumber);
          const deskTotal = (await pc.readContract({ address: network.imprest.factory!, abi: deskFactoryAbi, functionName: "deskTotal", blockNumber })) as bigint;
          let confirmed: boolean | null = null;
          const vc = verifyClient();
          if (vc) {
            try {
              const b = await Promise.race([
                readPool(vc as any, blockNumber),
                new Promise<never>((_, rej) => setTimeout(() => rej(new Error("second RPC timeout")), 8_000)),
              ]);
              confirmed = JSON.stringify(a, (_, x) => (typeof x === "bigint" ? x.toString() : x)) === JSON.stringify(b, (_, x) => (typeof x === "bigint" ? x.toString() : x));
            } catch {
              confirmed = false;
            }
          }
          return { ...a, deskTotal, confirmedOnSecondRpc: confirmed, blockNumber };
        }
      : null,
    10_000,
    "pool",
  );
}
