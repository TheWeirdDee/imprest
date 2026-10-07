"use client";

import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { marketBySymbol } from "@imprest/core";
import { useCohorts } from "@/lib/desk";
import { deployed, network } from "@/lib/env";
import { scaled, shortAddr } from "@/lib/format";
import { MarkAge, PriceChart, useTicker } from "./market";
import { AddressLink, Skeleton } from "./ui";

/**
 * Landing-page product panel. Everything in it is live: the Perpl testnet market, and the
 * policy every desk enforces, read from the deployed DeskFactory. No mock balances.
 */
export function LiveDeskPanel() {
  const m = marketBySymbol(network, "BTC")!;
  const t = useTicker(m);
  const cohorts = useCohorts();
  const demo = cohorts.data?.find((c) => c.policy.demo) ?? cohorts.data?.[0];
  const p = demo?.policy;
  const chg = t.data?.mark && t.data?.prev24h ? (t.data.mark - t.data.prev24h) / t.data.prev24h : null;
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.12)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold">BTC-PERP</span>
          <span className="num text-sm">{t.data?.mark ? scaled(t.data.mark, m.priceDecimals) : "—"}</span>
          {chg !== null && <span className={chg >= 0 ? "num text-xs text-long" : "num text-xs text-short"}>{(chg * 100).toFixed(2)}%</span>}
        </div>
        <MarkAge ticker={t.data ?? null} />
      </div>
      <div className="grid md:grid-cols-[minmax(0,1fr)_230px]">
        <div className="min-w-0 border-b border-line md:border-r md:border-b-0">
          <PriceChart m={m} height={230} />
        </div>
        <div className="p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-fg-2">
            <ShieldCheck size={13} aria-hidden className="text-safe" /> Enforced on every order
          </div>
          {!deployed || !p ? (
            <Skeleton className="mt-3 h-36" />
          ) : (
            <dl className="mt-2 space-y-1.5 text-[13px]">
              {[
                ["Max leverage", `${(p.maxLeverageHdths / 100).toFixed(2)}x`],
                ["Price band", `${p.priceBandBps} bps of mark`],
                ["Order types", "IOC / FOK only"],
                ["Risk floor", `${p.maxDrawdownBps / 100}% below start`],
                ["Daily loss", `${p.dailyLossBps / 100}% of day start`],
                ["Negative-PnL cap", `${p.maxNegPnlBps} bps`],
                ["Funded desk", `${p.tiers[1]?.sizeMultiple ?? "—"}x stake`],
                ["Trader split", `${(p.tiers[1]?.traderSplitBps ?? 0) / 100}%`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className="num text-right">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="mt-3 border-t border-line pt-2 text-[11px] text-muted">
            Read from DeskFactory {network.imprest.factory ? <AddressLink address={network.imprest.factory} label={shortAddr(network.imprest.factory)} /> : "pending"}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-2 px-4 py-2 text-[11px] text-muted">
        <span>Live Perpl testnet market · {network.label}</span>
        <Link href="/app/trade/btc" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
          Open terminal <ArrowUpRight size={12} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
