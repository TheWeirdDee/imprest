import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import type { Address } from "viem";
import { deskAbi, deskFactoryAbi, erc20Abi, perplExchangeAbi, toCohortPolicy, type CohortPolicy, type RiskState } from "@imprest/core";
import { useAccount } from "./account";
import { deployed, network, primary } from "./chain";

export interface Loadable<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

/** Polls while the app is in the foreground. Bounded interval, chain reads only. */
export function usePoll<T>(fn: (() => Promise<T>) | null, ms: number, key: string): Loadable<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(fn));
  const ref = useRef(fn);
  ref.current = fn;
  const tick = useCallback(async () => {
    if (!ref.current) return;
    try {
      setData(await ref.current());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (!fn) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void tick();
    const id = setInterval(() => {
      if (AppState.currentState === "active") void tick();
    }, ms);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ms]);
  return { data, error, loading, refresh: () => void tick() };
}

export interface Position {
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

interface DeskCtx {
  balances: Loadable<{ ausd: bigint; native: bigint }>;
  desk: Address | null;
  deskLoading: boolean;
  risk: Loadable<RiskState>;
  policy: Loadable<CohortPolicy>;
  positions: Loadable<Position[]>;
  refreshAll: () => void;
}

const Ctx = createContext<DeskCtx | null>(null);

export function DeskProvider({ children }: { children: ReactNode }) {
  const a = useAccount();
  const addr = a.status === "ready" ? a.address : null;
  const balances = usePoll(
    addr && network.perpl.collateralToken
      ? async () => {
          const [ausd, native] = await Promise.all([
            primary.readContract({ address: network.perpl.collateralToken!, abi: erc20Abi, functionName: "balanceOf", args: [addr] }) as Promise<bigint>,
            primary.getBalance({ address: addr }),
          ]);
          return { ausd, native };
        }
      : null,
    8000,
    `bal:${addr}`,
  );
  const deskQ = usePoll(
    addr && deployed
      ? async () => {
          const all = (await primary.readContract({ address: network.imprest.factory!, abi: deskFactoryAbi, functionName: "getDesks", args: [addr] })) as readonly Address[];
          return all.length ? all[all.length - 1]! : null;
        }
      : null,
    10_000,
    `desk:${addr}`,
  );
  const desk = deskQ.data ?? null;
  const risk = usePoll(desk ? async () => (await primary.readContract({ address: desk, abi: deskAbi, functionName: "riskState" })) as unknown as RiskState : null, 5000, `risk:${desk}`);
  const policy = usePoll(desk ? async () => toCohortPolicy(await primary.readContract({ address: desk, abi: deskAbi, functionName: "policy" })) : null, 120_000, `pol:${desk}`);
  const accountId = risk.data?.accountId ?? null;
  const positions = usePoll(
    accountId && network.perpl.exchange
      ? async () =>
          Promise.all(
            network.perpl.markets.map(async (m) => {
              const [p, mark, valid] = (await primary.readContract({
                address: network.perpl.exchange!,
                abi: perplExchangeAbi as any,
                functionName: "getPosition",
                args: [BigInt(m.perpId), accountId],
              })) as [any, bigint, boolean];
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
              };
            }),
          )
      : null,
    5000,
    `pos:${accountId}`,
  );
  const refreshAll = () => {
    balances.refresh();
    deskQ.refresh();
    risk.refresh();
    positions.refresh();
  };
  return (
    <Ctx.Provider value={{ balances, desk, deskLoading: deskQ.loading, risk, policy, positions, refreshAll }}>{children}</Ctx.Provider>
  );
}

export function useDesk(): DeskCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDesk outside DeskProvider");
  return v;
}
