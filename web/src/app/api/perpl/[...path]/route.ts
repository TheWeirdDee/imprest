import { NextResponse, type NextRequest } from "next/server";
import { network } from "@/lib/env";

/**
 * Read-only proxy for Perpl's public market-data API (it sends no CORS headers).
 * Strict allowlist of GET paths. Data is for display only and never authorizes anything.
 */
const ALLOWED = [
  /^pub\/context$/,
  /^market-data\/\d{1,4}\/ticker$/,
  /^market-data\/\d{1,4}\/book$/,
  /^market-data\/\d{1,4}\/candles\/(60|300|900|1800|3600|7200|14400|28800|43200|86400)\/\d{10,14}-\d{10,14}$/,
  /^market-data\/\d{1,4}\/funding\/\d{10,14}-\d{10,14}$/,
];

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const p = path.join("/");
  if (!ALLOWED.some((r) => r.test(p))) {
    return NextResponse.json({ error: "path not allowed" }, { status: 400 });
  }
  const base = network.perpl.apiUrl;
  if (!base) {
    return NextResponse.json({ error: "Perpl API is not configured for this environment" }, { status: 503 });
  }
  const levels = req.nextUrl.searchParams.get("levels");
  const qs = levels && /^\d{1,3}$/.test(levels) ? `?levels=${levels}` : "";
  const url = `${base}/v1/${p}${qs}`;
  // Identical reads within CACHE_MS share one upstream call (every page polls the ticker).
  const now = Date.now();
  let hit = cache.get(url);
  if (!hit || now - hit.at > CACHE_MS) {
    hit = { at: now, result: fetchWithRetry(url) };
    cache.set(url, hit);
    if (cache.size > 200) for (const [k, v] of cache) if (now - v.at > CACHE_MS) cache.delete(k);
  }
  const r = await hit.result;
  return new NextResponse(r.body, {
    status: r.status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-imprest-source": base },
  });
}

const CACHE_MS = 2_000;
const cache = new Map<string, { at: number; result: Promise<{ status: number; body: string }> }>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The public API rate-limits (429): retry with backoff instead of passing the refusal to the page. */
async function fetchWithRetry(url: string): Promise<{ status: number; body: string }> {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (r.status === 429 || r.status >= 500) {
        last = `HTTP ${r.status}`;
        await sleep(300 * 2 ** attempt);
        continue;
      }
      return { status: r.status, body: await r.text() };
    } catch (e) {
      last = (e as Error).message;
      await sleep(300 * 2 ** attempt);
    }
  }
  return { status: 503, body: JSON.stringify({ error: "Perpl API unavailable after retries", detail: last }) };
}
