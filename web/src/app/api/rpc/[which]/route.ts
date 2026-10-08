import { NextResponse, type NextRequest } from "next/server";
import { network } from "@/lib/env";

/**
 * Read-only JSON-RPC proxy for the browser. Two reasons it exists:
 *  - the independent verification RPC sends no valid CORS header, so browsers cannot call it;
 *  - the public RPC rate-limits (429); the server retries with backoff instead of the page failing.
 * "primary" and "verify" stay separate upstreams so second-RPC confirmation remains independent.
 * Only read methods are forwarded; transactions never go through here.
 */
const READ_METHODS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_call",
  "eth_getBalance",
  "eth_getCode",
  "eth_getLogs",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getTransactionCount",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 1.5 s cache of identical single reads (keyed without the request id), so many components and
// tabs asking the same question cost one upstream call. Display reads only; ids are re-attached.
const CACHE_MS = 1_500;
const cache = new Map<string, { at: number; result: Promise<{ status: number; text: string }> }>();

export async function POST(req: NextRequest, ctx: { params: Promise<{ which: string }> }) {
  const { which } = await ctx.params;
  const upstream = which === "primary" ? network.rpcUrls[0] : which === "verify" ? network.rpcUrls[1] : undefined;
  if (!upstream) return NextResponse.json({ error: "unknown rpc" }, { status: 404 });

  const body = await req.text();
  if (body.length > 200_000) return NextResponse.json({ error: "request too large" }, { status: 413 });
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const calls = Array.isArray(parsed) ? parsed : [parsed];
  if (calls.length === 0 || calls.length > 50) return NextResponse.json({ error: "batch size must be 1-50" }, { status: 400 });
  for (const c of calls) {
    const m = (c as { method?: unknown })?.method;
    if (typeof m !== "string" || !READ_METHODS.has(m)) return NextResponse.json({ error: `method not allowed: ${String(m)}` }, { status: 403 });
  }

  // The verification RPC refuses JSON-RPC batches, so its batches are split here; the primary accepts them.
  const one = async (payload: string): Promise<{ status: number; text: string }> => {
    let last = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(upstream, { method: "POST", headers: { "content-type": "application/json" }, body: payload, cache: "no-store", signal: AbortSignal.timeout(6000) });
        if (r.status === 429 || r.status >= 500) {
          last = `HTTP ${r.status}`;
          await sleep(250 * 2 ** attempt);
          continue;
        }
        return { status: r.status, text: await r.text() };
      } catch (e) {
        last = (e as Error).message;
        await sleep(250 * 2 ** attempt);
      }
    }
    return { status: 502, text: JSON.stringify({ error: `${which} RPC unavailable after retries: ${last}` }) };
  };
  const headers = { "content-type": "application/json", "cache-control": "no-store", "x-imprest-upstream": which };

  // Single call: served from the short cache when an identical read is in flight or fresh.
  const cached = async (c: { id?: unknown; method: string; params?: unknown }) => {
    const key = `${which}|${c.method}|${JSON.stringify(c.params ?? [])}`;
    const now = Date.now();
    let hit = cache.get(key);
    if (!hit || now - hit.at > CACHE_MS) {
      hit = { at: now, result: one(JSON.stringify({ jsonrpc: "2.0", id: 1, method: c.method, params: c.params ?? [] })) };
      cache.set(key, hit);
      if (cache.size > 500) for (const [k, v] of cache) if (now - v.at > CACHE_MS) cache.delete(k);
    }
    const r = await hit.result;
    if (r.status !== 200) return r;
    try {
      return { status: 200, text: JSON.stringify({ ...JSON.parse(r.text), id: c.id ?? null }) };
    } catch {
      return r;
    }
  };

  if (!Array.isArray(parsed)) {
    const r = await cached(parsed as { method: string });
    return new NextResponse(r.text, { status: r.status, headers });
  }
  if (which === "primary") {
    const r = await one(body);
    return new NextResponse(r.text, { status: r.status, headers });
  }
  const results = await Promise.all(calls.map((c) => cached(c as { method: string })));
  const failed = results.find((r) => r.status !== 200);
  if (failed) return new NextResponse(failed.text, { status: failed.status, headers });
  return new NextResponse(`[${results.map((r) => r.text).join(",")}]`, { status: 200, headers });
}
