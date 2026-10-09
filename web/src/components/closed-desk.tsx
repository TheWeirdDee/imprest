"use client";

import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { ENFORCE_REASON } from "@imprest/core";
import { useDesk } from "@/lib/desk-context";
import { ausd, signedAusd } from "@/lib/format";
import { AddressLink, Card, Skeleton, buttonClass } from "./ui";

/**
 * A settled desk. Withdrawing capital is not a trading loss, so this replaces every
 * active-desk metric (equity, PnL, floors, eligibility) with the settlement outcome.
 */
export function ClosedDeskCard({ compact = false }: { compact?: boolean }) {
  const d = useDesk();
  const r = d.risk.data;
  const o = d.outcome.data;
  if (!r || !d.closed) return null;
  const reason = o ? ENFORCE_REASON[o.reason] ?? "Unknown" : null;
  const net = o ? o.paidToTrader - r.originalStake : null;
  return (
    <Card>
      <div className="flex items-start gap-3">
        <CircleCheck size={20} aria-hidden className="mt-0.5 shrink-0 text-fg" />
        <div className="min-w-0 flex-1 text-sm">
          <h2 className="font-semibold">Desk closed</h2>
          <p className="mt-1 text-fg-2">
            {reason === null
              ? "This desk has been settled."
              : reason === "None"
                ? "You closed this desk and it has been settled."
                : `This desk was closed by enforcement (${reason.toLowerCase()}) and settled.`}{" "}
            It can no longer trade or claim.
          </p>
          {!o ? (
            <Skeleton className="mt-3 h-14" label="Reading the settlement" />
          ) : (
            <dl className="num mt-3 grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-1">
              <dt className="font-sans text-muted">Original stake</dt>
              <dd className="text-right">{ausd(r.originalStake)} AUSD</dd>
              <dt className="font-sans text-muted">Returned to your wallet (claims + settlement)</dt>
              <dd className="text-right">{ausd(o.paidToTrader, 6)} AUSD</dd>
              <dt className="font-sans text-muted">Net change from the stake</dt>
              <dd className={net! >= 0n ? "text-right text-safe" : "text-right text-breach"}>{signedAusd(net!, 6)} AUSD</dd>
              {o.feeCollected > 0n && (
                <>
                  <dt className="font-sans text-muted">Credit fees paid</dt>
                  <dd className="text-right">{ausd(o.feeCollected, 4)} AUSD</dd>
                </>
              )}
            </dl>
          )}
          {!compact && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link href="/app/desk" className={buttonClass("primary", "md")}>
                Open a new desk
              </Link>
              {d.desk && (
                <span className="text-xs text-muted">
                  Closed desk <AddressLink address={d.desk} />
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
