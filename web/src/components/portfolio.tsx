"use client";

import { Droplets, ExternalLink } from "lucide-react";
import { useAccount } from "@/lib/account/AccountProvider";
import { useDesk } from "@/lib/desk-context";
import { faucetAction } from "@/lib/actions";
import { useAction } from "@/lib/tx";
import { network } from "@/lib/env";
import { ausd } from "@/lib/format";
import { formatUnitsFixed } from "@imprest/core";
import { Button, Skeleton } from "./ui";
import { TxStatus } from "./tx-status";

export function Portfolio() {
  const a = useAccount();
  const d = useDesk();
  const { state, run, reset } = useAction();
  if (a.status !== "ready") return <p className="text-sm text-muted">Sign in to see balances.</p>;
  const b = d.balances.data;
  const lowGas = b ? b.native < 10n ** 16n : false;
  return (
    <div className="space-y-3 text-sm">
      {!b ? (
        <Skeleton className="h-12" />
      ) : (
        <>
          <div className="flex justify-between">
            <span className="text-muted">AUSD (wallet)</span>
            <span className="num">{ausd(b.ausd)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">{network.nativeSymbol} (gas)</span>
            <span className="num">{formatUnitsFixed(b.native, 18, 4)}</span>
          </div>
        </>
      )}
      {network.ausdFaucet && (
        <Button
          variant="secondary"
          className="w-full"
          disabled={!a.account || state.kind === "submitted" || state.kind === "confirming" || lowGas}
          onClick={async () => {
            await run(faucetAction(a.account!));
            d.balances.refresh();
          }}
        >
          <Droplets size={14} aria-hidden /> Get 10,000 testnet AUSD
        </Button>
      )}
      {lowGas && network.faucet && (
        <p className="text-xs text-warn">
          You need testnet {network.nativeSymbol} for gas first.{" "}
          <a href={network.faucet} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
            Monad faucet <ExternalLink size={11} aria-hidden />
          </a>
        </p>
      )}
      <TxStatus state={state} onReset={reset} />
    </div>
  );
}
