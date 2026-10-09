"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Address } from "viem";
import type { CohortPolicy, RiskState } from "@imprest/core";
import { hasAccount, useAccount } from "./account/AccountProvider";
import { useBalances, useDeskOutcome, usePolicy, usePositions, useRiskState, useTraderDesk, type Loadable, type PositionView } from "./desk";

interface DeskCtx {
  address: Address | null;
  balances: Loadable<{ ausd: bigint; native: bigint }>;
  desk: Address | null;
  allDesks: readonly Address[];
  deskLoading: boolean;
  risk: Loadable<RiskState>;
  policy: Loadable<CohortPolicy>;
  positions: Loadable<PositionView[]>;
  /** The current desk is settled (status Closed): no trading, claims or risk limits apply. */
  closed: boolean;
  outcome: Loadable<{ paidToTrader: bigint; reason: number; feeCollected: bigint }>;
  refreshAll: () => void;
}

const Ctx = createContext<DeskCtx | null>(null);

export function DeskProvider({ children }: { children: ReactNode }) {
  const a = useAccount();
  const address = hasAccount(a) ? a.address : null;
  const balances = useBalances(address);
  const deskQ = useTraderDesk(address);
  const desk = deskQ.data?.current ?? null;
  const risk = useRiskState(desk);
  const policy = usePolicy(desk);
  const positions = usePositions(risk.data?.accountId ?? null, desk ?? "");
  const closed = risk.data?.status === 2;
  const outcome = useDeskOutcome(desk, closed);
  const refreshAll = () => {
    balances.refresh();
    deskQ.refresh();
    risk.refresh();
    positions.refresh();
  };
  return (
    <Ctx.Provider
      value={{
        address,
        balances,
        desk,
        allDesks: deskQ.data?.all ?? [],
        deskLoading: deskQ.loading,
        risk,
        policy,
        positions,
        closed,
        outcome,
        refreshAll,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useDesk(): DeskCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDesk outside DeskProvider");
  return c;
}
