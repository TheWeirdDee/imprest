"use client";

import { useEffect, useRef, useState } from "react";
import { CandlestickChart, Clock } from "lucide-react";
import type { MarketConfig } from "@imprest/core";
import { fetchBook, fetchCandles, fetchTicker, type BookLevel, type Ticker } from "@/lib/market";
import { usePoll } from "@/lib/desk";
import { scaled } from "@/lib/format";
import { EmptyState, Pill, Skeleton, cx } from "./ui";

export function useTicker(m: MarketConfig) {
  return usePoll<Ticker>(() => fetchTicker(m.perpId), 3000, `ticker:${m.perpId}`);
}

const RES = [
  { s: 60, l: "1m" },
  { s: 300, l: "5m" },
  { s: 900, l: "15m" },
  { s: 3600, l: "1h" },
];

/** Real Perpl candles. If the API is unreachable the chart says so; it never draws placeholder data. */
export function PriceChart({ m, height = 360 }: { m: MarketConfig; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const [res, setRes] = useState(300);
  const candles = usePoll(() => fetchCandles(m.perpId, res, 300), 30_000, `candles:${m.perpId}:${res}`);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const lc = await import("lightweight-charts");
      if (disposed || !el.current) return;
      const chart = lc.createChart(el.current, {
        autoSize: true,
        layout: { background: { color: "transparent" }, textColor: "#6b6f78", fontFamily: "ui-monospace, monospace", fontSize: 11 },
        grid: { vertLines: { color: "#f0eee9" }, horzLines: { color: "#f0eee9" } },
        rightPriceScale: { borderColor: "#e5e2db" },
        timeScale: { borderColor: "#e5e2db", timeVisible: true, secondsVisible: false },
        crosshair: { mode: 1 },
      });
      const series = chart.addSeries(lc.CandlestickSeries, {
        upColor: "#1d8650",
        downColor: "#c0392f",
        borderVisible: false,
        wickUpColor: "#1d8650",
        wickDownColor: "#c0392f",
        priceFormat: { type: "price", precision: m.priceDecimals, minMove: 1 / 10 ** m.priceDecimals },
      });
      chartRef.current = chart;
      seriesRef.current = series;
    })();
    return () => {
      disposed = true;
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [m.perpId, m.priceDecimals]);

  useEffect(() => {
    const s = seriesRef.current;
    if (!s || !candles.data) return;
    const k = 10 ** m.priceDecimals;
    s.setData(
      candles.data
        .map((c) => ({ time: Math.floor(c.t / 1000), open: c.o / k, high: c.h / k, low: c.l / k, close: c.c / k }))
        .sort((a, b) => a.time - b.time),
    );
  }, [candles.data, m.priceDecimals]);

  return (
    <div className="relative">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
        <div className="flex items-center gap-1" role="group" aria-label="Candle resolution">
          {RES.map((r) => (
            <button
              key={r.s}
              onClick={() => setRes(r.s)}
              aria-pressed={res === r.s}
              className={cx("rounded px-2 py-0.5 text-xs", res === r.s ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}
            >
              {r.l}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted">Perpl market data</span>
      </div>
      <div ref={el} style={{ height }} className="w-full" aria-label={`${m.symbol} price chart`} role="img" />
      {candles.error && !candles.data && (
        <div className="absolute inset-0 top-8 flex items-center justify-center bg-surface/80">
          <EmptyState icon={CandlestickChart} title="Chart data unavailable">
            Perpl&apos;s market-data API did not respond ({candles.error}). Nothing is drawn instead of real candles.
          </EmptyState>
        </div>
      )}
      {candles.loading && !candles.data && <Skeleton className="absolute inset-x-3 top-12 bottom-3" />}
      {candles.data && candles.data.length === 0 && (
        <div className="absolute inset-0 top-8 flex items-center justify-center">
          <EmptyState title="No trades in this window yet" />
        </div>
      )}
    </div>
  );
}

export function OrderBook({ m, mark }: { m: MarketConfig; mark: number | null }) {
  const book = usePoll(() => fetchBook(m.perpId, 10), 3000, `book:${m.perpId}`);
  if (book.error && !book.data) return <EmptyState title="Order book unavailable">{book.error}</EmptyState>;
  if (!book.data) return <Skeleton className="m-3 h-48" />;
  const asks = [...book.data.ask].slice(0, 8).reverse();
  const bids = book.data.bid.slice(0, 8);
  const maxS = Math.max(1, ...[...asks, ...bids].map((l) => l.s));
  const row = (l: BookLevel, side: "ask" | "bid") => (
    <div key={`${side}${l.p}`} className="relative grid grid-cols-2 px-3 py-[2px] text-xs">
      <div className={cx("absolute inset-y-0 right-0", side === "ask" ? "bg-short/10" : "bg-long/10")} style={{ width: `${(l.s / maxS) * 100}%` }} aria-hidden />
      <span className={cx("num relative", side === "ask" ? "text-short" : "text-long")}>{scaled(l.p, m.priceDecimals)}</span>
      <span className="num relative text-right text-fg-2">{scaled(l.s, m.lotDecimals)}</span>
    </div>
  );
  return (
    <div aria-label={`${m.symbol} order book`}>
      <div className="grid grid-cols-2 px-3 py-1.5 text-[10px] tracking-wide text-muted uppercase">
        <span>Price</span>
        <span className="text-right">Size ({m.symbol})</span>
      </div>
      {asks.map((l) => row(l, "ask"))}
      <div className="num border-y border-line px-3 py-1 text-center text-sm">{mark !== null ? scaled(mark, m.priceDecimals) : "—"} <span className="text-[10px] text-muted">mark</span></div>
      {bids.map((l) => row(l, "bid"))}
      <div className="px-3 py-1 text-[10px] text-muted">block {book.data.block}</div>
    </div>
  );
}

export function MarkAge({ ticker }: { ticker: Ticker | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!ticker || !ticker.ts) return <Pill tone="info">mark age unknown</Pill>;
  const age = Math.max(0, Math.round((now - ticker.ts) / 1000));
  return age > 60 ? (
    <Pill tone="breach" icon={Clock}>
      data {age}s old
    </Pill>
  ) : (
    <Pill tone="safe" icon={Clock}>
      live · {age}s
    </Pill>
  );
}
