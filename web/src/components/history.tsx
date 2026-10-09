"use client";

import { formatUnitsFixed, ENFORCE_REASON } from "@imprest/core";
import { useDesk } from "@/lib/desk-context";
import { usePoll } from "@/lib/desk";
import { deskHistory, type DeskEvent } from "@/lib/history";
import { network } from "@/lib/env";
import { ausd } from "@/lib/format";
import { EmptyState, Skeleton, TxLink, cx } from "./ui";

export function useHistory() {
  const d = useDesk();
  return usePoll(d.desk ? () => deskHistory(d.desk!) : null, 15_000, `hist:${d.desk}`);
}

const ORDER_TYPE = ["Open long", "Open short", "Close long", "Close short"];

function describe(e: DeskEvent): { title: string; detail: string } {
  const a = e.args as any;
  switch (e.kind) {
    case "Trade": {
      const m = network.perpl.markets.find((x) => BigInt(x.perpId) === BigInt(a.perpId));
      const fmtLots = (v: bigint) => (m ? formatUnitsFixed(BigInt(v), m.lotDecimals, m.lotDecimals) : String(v));
      const filled = BigInt(a.lotsAfter) !== BigInt(a.lotsBefore);
      return {
        title: `${ORDER_TYPE[Number(a.orderType)] ?? "Order"} ${m?.symbol ?? a.perpId}`,
        detail: `${a.fillOrKill ? "FOK" : "IOC"} ${fmtLots(a.lots)} @ ${m ? formatUnitsFixed(BigInt(a.priceLimit), m.priceDecimals, m.priceDecimals) : a.priceLimit} · ${filled ? `position ${fmtLots(a.lotsBefore)} -> ${fmtLots(a.lotsAfter)}` : "no fill"}`,
      };
    }
    case "Graduated":
      return { title: `Graduated to tier ${a.toTier}`, detail: `credit ${ausd(BigInt(a.credit))} AUSD, floor ${ausd(BigInt(a.floor))}` };
    case "Claimed":
      return { title: "Profit claimed", detail: `gross ${ausd(BigInt(a.gross))}, fees ${ausd(BigInt(a.feesPaid))}, trader ${ausd(BigInt(a.traderShare))}` };
    case "Settled":
      return { title: `Settled (${ENFORCE_REASON[Number(a.reason)] === "None" ? "voluntary close" : ENFORCE_REASON[Number(a.reason)]})`, detail: `principal repaid ${ausd(BigInt(a.principalRepaid))}, loss ${ausd(BigInt(a.principalLoss))}, keeper ${ausd(BigInt(a.keeperPaid))}, trader ${ausd(BigInt(a.traderRemainder))}` };
    case "EnforcementStarted":
      return { title: `Enforcement started: ${ENFORCE_REASON[Number(a.reason)]}`, detail: `equity ${ausd(BigInt(a.equity))}` };
    case "FeesAccrued":
      return { title: "Credit fee accrued", detail: `+${ausd(BigInt(a.added), 6)} AUSD, outstanding ${ausd(BigInt(a.outstanding), 4)}` };
    case "PartialClose":
      return { title: "Partial close", detail: `${a.openPositions} position(s) still open` };
    case "DeskActivated":
      return { title: "Desk opened", detail: `stake ${ausd(BigInt(a.stake))} AUSD, Perpl account ${a.accountId}` };
  }
}

export function HistoryList({ kinds }: { kinds?: DeskEvent["kind"][] }) {
  const h = useHistory();
  if (h.loading && !h.data) return <Skeleton className="m-3 h-24" />;
  if (h.error && !h.data)
    return (
      <EmptyState title="History unavailable">
        Indexer unavailable — blockchain data may be delayed, and the direct chain read also failed ({h.error.split("\n")[0]!.slice(0, 140)}). Retrying.
      </EmptyState>
    );
  const rows = (h.data?.events ?? []).filter((e) => !kinds || kinds.includes(e.kind));
  return (
    <div>
      {h.data?.source === "rpc-scan" && (
        <p role="status" className="border-b border-line bg-warn-bg px-3 py-2 text-xs text-warn">
          Indexer unavailable — blockchain data may be delayed. Showing a direct RPC scan of recent blocks only.
        </p>
      )}
      {rows.length === 0 ? (
        <EmptyState title="No activity yet" />
      ) : (
        <ul>
          {rows.map((e) => {
            const x = describe(e);
            return (
              <li key={`${e.txHash}-${e.kind}-${x.title}`} className="flex flex-col gap-1 border-t border-line px-3 py-2.5 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className={cx("text-sm", e.kind === "EnforcementStarted" ? "text-breach" : "text-fg")}>{x.title}</div>
                  <div className="num truncate text-xs text-muted">{x.detail}</div>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                  <span className="num">#{e.blockNumber.toString()}</span>
                  <TxLink hash={e.txHash} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t border-line px-3 py-2 text-[11px] text-muted">
        Source: {h.data?.source === "indexer" ? "Envio indexer (display only)" : `bounded RPC scan of blocks ${h.data?.scannedBlocks ?? ""} (indexer unavailable)`}.
        {h.data?.missedChunks ? ` ${h.data.missedChunks} of 50 block ranges could not be read this time; refreshing.` : ""}
        {" "}History never authorizes money movement.
      </p>
    </div>
  );
}

export function FillsTable() {
  return <HistoryList kinds={["Trade"]} />;
}
