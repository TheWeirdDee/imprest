"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Address } from "viem";
import type { CohortPolicy, RiskState } from "@imprest/core";
import { hasAccount, useAccount } from "./account/AccountProvider";
import { useBalances, useDeskOutcome, usePolicy, usePositions, useRiskState, useTraderDesk, type Loadable, type PositionView } from "./desk";

interface DeskCtx {
  address: Address | null;
  balances: Loadable<{ ausd: bigint; native: bigint }>;
  desk: Address | null;
  allDesks: readonly Address[];
  /** Choose which of the account's desks the app shows (remembered per account on this device). */
  selectDesk: (desk: Address | null) => void;
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
  // Which desk to show: the one chosen for this account (if it is still one of its desks), else the latest.
  const key = address ? `imprest.desk.selected.${address.toLowerCase()}` : null;
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => {
    try {
      setChosen(key ? localStorage.getItem(key) : null);
    } catch {
      setChosen(null);
    }
  }, [key]);
  const selectDesk = useCallback(
    (d: Address | null) => {
      setChosen(d);
      try {
        if (key) d ? localStorage.setItem(key, d) : localStorage.removeItem(key);
      } catch {
        /* storage blocked: selection lasts for this page */
      }
    },
    [key],
  );
  const all = deskQ.data?.all ?? [];
  const desk = (chosen && all.find((x) => x.toLowerCase() === chosen.toLowerCase())) || (deskQ.data?.current ?? null);
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
        allDesks: all,
        selectDesk,
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
