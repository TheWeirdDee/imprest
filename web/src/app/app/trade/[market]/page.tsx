"use client";

import Link from "next/link";
import { use, useState } from "react";
import { notFound } from "next/navigation";
import { marketBySymbol, type MarketConfig } from "@imprest/core";
import { network } from "@/lib/env";
import { useDesk } from "@/lib/desk-context";
import { scaled } from "@/lib/format";
import { MarkAge, OrderBook, PriceChart, useTicker } from "@/components/market";
import { OrderTicket } from "@/components/order-ticket";
import { PositionsTable } from "@/components/positions-table";
import { RiskMeter } from "@/components/risk-meter";
import { FillsTable } from "@/components/history";
import { Card, cx } from "@/components/ui";
import { RequireDesk } from "@/components/gates";

function MarketRow({ m, active }: { m: MarketConfig; active: boolean }) {
  const t = useTicker(m);
  const chg = t.data?.mark && t.data?.prev24h ? (t.data.mark - t.data.prev24h) / t.data.prev24h : null;
  return (
    <Link
      href={`/app/trade/${m.symbol.toLowerCase()}`}
      aria-current={active ? "page" : undefined}
      className={cx("flex items-center justify-between rounded-md px-2.5 py-2 text-sm", active ? "bg-surface-3" : "hover:bg-surface-2")}
    >
      <span className="font-semibold">{m.symbol}-PERP</span>
      <span className="text-right">
        <span className="num block text-xs">{t.data?.mark ? scaled(t.data.mark, m.priceDecimals, 1) : "—"}</span>
        {chg !== null && <span className={cx("num block text-[10px]", chg >= 0 ? "text-long" : "text-short")}>{(chg * 100).toFixed(2)}%</span>}
      </span>
    </Link>
  );
}

function Header({ m }: { m: MarketConfig }) {
  const t = useTicker(m);
  const x = t.data;
  const chg = x?.mark && x?.prev24h ? (x.mark - x.prev24h) / x.prev24h : null;
  const stats: [string, string | null][] = [
    ["Mark", x?.mark ? scaled(x.mark, m.priceDecimals) : null],
    ["Oracle", x?.oracle ? scaled(x.oracle, m.priceDecimals) : null],
    ["Last", x?.last ? scaled(x.last, m.priceDecimals) : null],
    ["24h change", chg !== null ? `${(chg * 100).toFixed(2)}%` : null],
    ["Bid / Ask", x?.bid && x?.ask ? `${scaled(x.bid, m.priceDecimals)} / ${scaled(x.ask, m.priceDecimals)}` : null],
    ["Open interest", x?.openInterest ? `${scaled(x.openInterest, m.lotDecimals, 3)} ${m.symbol}` : null],
    ["24h volume", x?.volume24h ? `${(Number(x.volume24h) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 0 })} AUSD` : null],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-4 py-3">
      <div>
        <h1 className="text-lg font-semibold">{m.symbol}-PERP</h1>
        <div className="text-[11px] text-muted">
          Perpl {network.label.toLowerCase()} · perp {m.perpId}
        </div>
      </div>
      {stats.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <div className="text-[10px] tracking-wide text-muted uppercase">{k}</div>
          <div className={cx("num text-sm", k === "24h change" && chg !== null ? (chg >= 0 ? "text-long" : "text-short") : "")}>{v ?? "—"}</div>
        </div>
      ))}
      <MarkAge ticker={x ?? null} />
      {t.error && !x && <span className="text-xs text-warn">Market data unavailable: {t.error}</span>}
    </div>
  );
}

export default function TradePage({ params }: { params: Promise<{ market: string }> }) {
  const { market } = use(params);
  const m = marketBySymbol(network, market);
  if (!m) notFound();
  const t = useTicker(m);
  const d = useDesk();
  const [tab, setTab] = useState<"positions" | "fills">("positions");

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="grid gap-3 xl:grid-cols-[180px_minmax(0,1fr)_340px]">
        <nav aria-label="Markets" className="hidden flex-col gap-1 rounded-[var(--radius-card)] border border-line bg-surface p-2 xl:flex">
          <div className="px-2 pt-1 pb-2 text-[11px] tracking-wide text-muted uppercase">Markets</div>
          {network.perpl.markets.map((x) => (
            <MarketRow key={x.perpId} m={x} active={x.perpId === m.perpId} />
          ))}
          <p className="mt-auto px-2 pt-3 text-[10px] leading-relaxed text-muted">Only allowlisted markets are tradable from a desk.</p>
        </nav>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex gap-1 xl:hidden" role="tablist" aria-label="Markets">
            {network.perpl.markets.map((x) => (
              <Link key={x.perpId} href={`/app/trade/${x.symbol.toLowerCase()}`} className={cx("rounded-md px-3 py-1.5 text-sm", x.perpId === m.perpId ? "bg-surface-3 text-fg" : "text-muted")}>
                {x.symbol}
              </Link>
            ))}
          </div>
          <section className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            <Header m={m} />
            <div className="grid lg:grid-cols-[minmax(0,1fr)_230px]">
              <PriceChart m={m} height={340} />
              <div className="hidden border-l border-line lg:block">
                <OrderBook m={m} mark={t.data?.mark ?? null} />
              </div>
            </div>
          </section>

          {d.risk.data && (
            <Card title="Risk" pad>
              <RiskMeter r={d.risk.data} compact />
            </Card>
          )}

          <section className="rounded-[var(--radius-card)] border border-line bg-surface">
            <div role="tablist" aria-label="Account panels" className="flex gap-1 border-b border-line px-2 pt-1.5">
              {(["positions", "fills"] as const).map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={cx("border-b-2 px-3 py-1.5 text-sm capitalize", tab === k ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}
                >
                  {k}
                </button>
              ))}
            </div>
            <div role="tabpanel">
              <RequireDesk what={tab === "positions" ? "positions" : "fills"}>{tab === "positions" ? <PositionsTable /> : <FillsTable />}</RequireDesk>
            </div>
          </section>
        </div>

        <aside aria-label="Order ticket" className="rounded-[var(--radius-card)] border border-line bg-surface p-3 xl:sticky xl:top-16 xl:self-start">
          <OrderTicket m={m} tickerMark={t.data?.mark ?? null} />
        </aside>
      </div>
    </div>
  );
}
