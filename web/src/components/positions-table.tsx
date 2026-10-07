"use client";

import Link from "next/link";
import { formatUnitsFixed, notional, type MarketConfig } from "@imprest/core";
import { useDesk } from "@/lib/desk-context";
import { network } from "@/lib/env";
import { ausd, signedAusd } from "@/lib/format";
import { EmptyState, Pill, Skeleton, cx } from "./ui";

/** Open Perpl positions of the desk, read from chain (getPosition). */
export function PositionsTable({ compact = false }: { compact?: boolean }) {
  const d = useDesk();
  const rows = (d.positions.data ?? []).filter((p) => p.lots > 0n);
  if (d.positions.loading && !d.positions.data) return <Skeleton className="m-3 h-16" />;
  if (d.positions.error && !d.positions.data) return <EmptyState title="Positions unavailable">{d.positions.error}</EmptyState>;
  if (rows.length === 0) return <EmptyState title="No open positions">The desk is flat. Flat desks accrue no new credit fees and can claim.</EmptyState>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">Open positions</caption>
        <thead className="text-left text-[11px] tracking-wide text-muted uppercase">
          <tr>
            {["Market", "Side", "Size", "Entry", "Mark", "Notional", "Margin", "Unrealized PnL", "Funding", ""].map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="num">
          {rows.map((p) => {
            const m = network.perpl.markets.find((x) => x.perpId === p.perpId) as MarketConfig;
            return (
              <tr key={p.perpId} className="border-t border-line">
                <td className="px-3 py-2 font-sans font-semibold">{p.symbol}-PERP</td>
                <td className={cx("px-3 py-2 font-sans", p.isLong ? "text-long" : "text-short")}>{p.isLong ? "Long" : "Short"}</td>
                <td className="px-3 py-2">{formatUnitsFixed(p.lots, m.lotDecimals, m.lotDecimals)}</td>
                <td className="px-3 py-2">{formatUnitsFixed(p.entryPns, m.priceDecimals, m.priceDecimals)}</td>
                <td className="px-3 py-2">
                  {formatUnitsFixed(p.markPns, m.priceDecimals, m.priceDecimals)}{" "}
                  {!p.markValid && <Pill tone="breach">stale</Pill>}
                </td>
                <td className="px-3 py-2">{ausd(notional(m, p.lots, p.markPns))}</td>
                <td className="px-3 py-2">{ausd(p.depositCNS)}</td>
                <td className={cx("px-3 py-2", p.deltaPnlCNS >= 0n ? "text-long" : "text-short")}>{signedAusd(p.deltaPnlCNS)}</td>
                <td className="px-3 py-2 text-fg-2">{signedAusd(p.premiumPnlCNS)}</td>
                <td className="px-3 py-2 font-sans">
                  {!compact && (
                    <Link href={`/app/trade/${p.symbol.toLowerCase()}`} className="text-xs text-accent hover:underline">
                      Close
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[11px] text-muted">Read from Perpl&apos;s getPosition for the desk&apos;s own account. Unrealized PnL cannot be claimed.</p>
    </div>
  );
}
