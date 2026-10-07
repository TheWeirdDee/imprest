"use client";
/** Read-only Perpl market data via the server proxy (/api/perpl). Display only; never authorizes. */

export interface Ticker {
  block: number;
  ts: number;
  oracle: number | null;
  mark: number | null;
  last: number | null;
  mid: number | null;
  bid: number | null;
  ask: number | null;
  prev24h: number | null;
  volume24h: string | null;
  openInterest: number | null;
}

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: string;
  n: number;
}

export interface BookLevel {
  p: number;
  s: number;
  o: number;
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`/api/perpl/${path}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`Perpl API ${r.status}`);
  return (await r.json()) as T;
}

export async function fetchTicker(marketId: number): Promise<Ticker> {
  const j = await get<any>(`market-data/${marketId}/ticker`);
  const d = j?.d?.[String(marketId)];
  if (!d) throw new Error("ticker unavailable");
  return {
    block: d.at?.b ?? j.sn,
    ts: d.at?.t ?? 0,
    oracle: d.orl ?? null,
    mark: d.mrk ?? null,
    last: d.lst ?? null,
    mid: d.mid ?? null,
    bid: d.bid ?? null,
    ask: d.ask ?? null,
    prev24h: d.prv ?? null,
    volume24h: d.dva ?? null,
    openInterest: d.oi ?? null,
  };
}

export async function fetchCandles(marketId: number, resolution: number, count = 240): Promise<Candle[]> {
  const to = Date.now();
  const from = to - resolution * 1000 * count;
  const j = await get<any>(`market-data/${marketId}/candles/${resolution}/${from}-${to}`);
  return (j?.d ?? []) as Candle[];
}

export async function fetchBook(marketId: number, levels = 12): Promise<{ bid: BookLevel[]; ask: BookLevel[]; block: number }> {
  const j = await get<any>(`market-data/${marketId}/book?levels=${levels}`);
  return { bid: j?.bid ?? [], ask: j?.ask ?? [], block: j?.sn ?? 0 };
}
