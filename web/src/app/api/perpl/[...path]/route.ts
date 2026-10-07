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
  try {
    const r = await fetch(`${base}/v1/${p}${qs}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const body = await r.text();
    return new NextResponse(body, {
      status: r.status,
      headers: { "content-type": "application/json", "cache-control": "no-store", "x-imprest-source": base },
    });
  } catch (e) {
    return NextResponse.json({ error: "Perpl API unreachable", detail: String((e as Error).message) }, { status: 502 });
  }
}
