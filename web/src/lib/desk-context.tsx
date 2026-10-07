"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Address } from "viem";
import type { CohortPolicy, RiskState } from "@imprest/core";
import { useAccount } from "./account/AccountProvider";
import { useBalances, usePolicy, usePositions, useRiskState, useTraderDesk, type Loadable, type PositionView } from "./desk";

interface DeskCtx {
  address: Address | null;
  balances: Loadable<{ ausd: bigint; native: bigint }>;
  desk: Address | null;
  allDesks: readonly Address[];
  deskLoading: boolean;
  risk: Loadable<RiskState>;
  policy: Loadable<CohortPolicy>;
  positions: Loadable<PositionView[]>;
  refreshAll: () => void;
}

const Ctx = createContext<DeskCtx | null>(null);

export function DeskProvider({ children }: { children: ReactNode }) {
  const a = useAccount();
  const address = a.status === "ready" ? a.address : null;
  const balances = useBalances(address);
  const deskQ = useTraderDesk(address);
  const desk = deskQ.data?.current ?? null;
  const risk = useRiskState(desk);
  const policy = usePolicy(desk);
  const positions = usePositions(risk.data?.accountId ?? null, desk ?? "");
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
