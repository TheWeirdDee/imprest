import type { Metadata } from "next";
import { createPublicClient, http, type Address } from "viem";
import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { perplExchangeAbi } from "@imprest/core";
import { SiteHeader } from "@/components/shell";
import { Card } from "@/components/ui";
import { deployed, indexerUrl, network, relayerUrl } from "@/lib/env";
import { PasskeyCapability } from "./passkey-capability";
import { getClaims } from "@/lib/proof";

export const metadata: Metadata = { title: "Status" };
export const dynamic = "force-dynamic";

type Row = { name: string; state: "up" | "down" | "not-configured"; detail: string };

async function timed<T>(fn: () => Promise<T>): Promise<{ v: T | null; ms: number; err: string | null }> {
  const t = Date.now();
  try {
    const v = await fn();
    return { v, ms: Date.now() - t, err: null };
  } catch (e) {
    return { v: null, ms: Date.now() - t, err: (e as Error).message.split("\n")[0]!.slice(0, 160) };
  }
}

async function checks(): Promise<{ rows: Row[]; at: string }> {
  const rows: Row[] = [];
  const heads: bigint[] = [];
  for (const [i, url] of network.rpcUrls.entries()) {
    const c = createPublicClient({ transport: http(url, { timeout: 6000, retryCount: 0 }) });
    const r = await timed(async () => ({ id: await c.getChainId(), head: await c.getBlockNumber() }));
    if (r.v) heads.push(r.v.head);
    rows.push({
      name: i === 0 ? "Primary RPC" : "Verification RPC (independent)",
      state: r.v && r.v.id === network.chainId ? "up" : "down",
      detail: r.v ? `${url} · chain ${r.v.id} · block ${r.v.head} · ${r.ms} ms` : `${url} · ${r.err}`,
    });
  }
  if (heads.length === 2) {
    const lag = heads[0]! > heads[1]! ? heads[0]! - heads[1]! : heads[1]! - heads[0]!;
    rows.push({ name: "RPC head agreement", state: lag <= 10n ? "up" : "down", detail: `${lag} blocks apart` });
  }

  if (network.perpl.exchange) {
    const c = createPublicClient({ transport: http(network.rpcUrls[0], { timeout: 6000, retryCount: 0 }) });
    const ex = network.perpl.exchange as Address;
    const r = await timed(async () => {
      const [wl, halted, block] = await Promise.all([
        c.readContract({ address: ex, abi: perplExchangeAbi as any, functionName: "whitelistingEnabled" }) as Promise<boolean>,
        c.readContract({ address: ex, abi: perplExchangeAbi as any, functionName: "isHalted" }) as Promise<boolean>,
        c.getBlock(),
      ]);
      const ages = await Promise.all(
        network.perpl.markets.map(async (m) => {
          const info: any = await c.readContract({ address: ex, abi: perplExchangeAbi as any, functionName: "getPerpetualInfo", args: [BigInt(m.perpId)] });
          return `${m.symbol} mark ${Number(block.timestamp) - Number(info.markTimestamp)}s old (max ${info.refPriceMaxAgeSec}s)`;
        }),
      );
      return { wl, halted, ages };
    });
    rows.push({
      name: "Perpl exchange (onchain)",
      state: r.v && !r.v.halted ? "up" : "down",
      detail: r.v ? `whitelisting ${r.v.wl ? "ON" : "off"} · ${r.v.halted ? "HALTED" : "not halted"} · ${r.v.ages.join(" · ")}` : String(r.err),
    });
  }

  if (network.perpl.apiUrl) {
    const m = network.perpl.markets[0]!;
    const r = await timed(async () => {
      const res = await fetch(`${network.perpl.apiUrl}/v1/market-data/${m.perpId}/ticker`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
    rows.push({ name: "Perpl market-data API", state: r.v ? "up" : "down", detail: r.v ? `${network.perpl.apiUrl} · ${r.ms} ms` : String(r.err) });
  }

  rows.push({
    name: "Imprest contracts",
    state: deployed ? "up" : "not-configured",
    detail: deployed ? `pool ${network.imprest.pool} · factory ${network.imprest.factory}` : "PENDING: no deployment recorded in config/networks.json",
  });

  for (const [name, url, path] of [
    ["Relayer", relayerUrl, "/health"],
    ["Keeper", process.env.KEEPER_HEALTH_URL || null, ""],
  ] as const) {
    if (!url) {
      rows.push({ name, state: "not-configured", detail: "not configured for this deployment" });
      continue;
    }
    const r = await timed(async () => {
      const res = await fetch(`${url}${path}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
    rows.push({ name, state: r.v ? "up" : "down", detail: r.v ? `${url} · ${JSON.stringify(r.v).slice(0, 140)}` : `${url} · ${r.err}` });
  }

  if (!indexerUrl) {
    rows.push({ name: "Indexer (Envio)", state: "not-configured", detail: "not configured; history falls back to a bounded RPC scan" });
  } else {
    const r = await timed(async () => {
      const res = await fetch(indexerUrl!, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "{ chain_metadata { block_height latest_processed_block num_events_processed } }" }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const m = j?.data?.chain_metadata?.[0];
      if (!m) throw new Error(j?.errors?.[0]?.message ?? "no chain metadata");
      return { height: Number(m.block_height), processed: Number(m.latest_processed_block), events: Number(m.num_events_processed) };
    });
    const lag = r.v ? r.v.height - r.v.processed : null;
    rows.push({
      name: "Indexer (Envio)",
      state: r.v ? "up" : "down",
      detail: r.v
        ? `${lag! <= 20 ? "LIVE" : "SYNCING"} · processed block ${r.v.processed} of ${r.v.height} (${lag} behind) · ${r.v.events} events · display only`
        : `${indexerUrl} · ${r.err} · Indexer unavailable — blockchain data may be delayed`,
    });
  }
  return { rows, at: new Date().toISOString() };
}

function ProtocolStatus() {
  const C = getClaims();
  const v = (id: string) => C[id]?.status === "TESTNET_VERIFIED";
  const items: [string, string, boolean, string, string?][] = [
    ["Protocol", "Contracts deployed on Monad testnet", v("TESTNET_DEPLOYMENT_DESKFACTORY") && v("TESTNET_DEPLOYMENT_IMPRESTPOOL"), "bytecode matches the build on two RPCs"],
    ["Perpl trading", "Perpl integration", v("TESTNET_CANONICAL_CLOSE_PAYOUT"), "a desk-owned Perpl account traded BTC and closed"],
    ["Risk enforcement", "Direct contract rejection", v("TESTNET_CANONICAL_GUARDED_REJECTION"), "6x order reverted LeverageExceeded with no app involved"],
    ["Settlement", "Payout by contract", v("TESTNET_CANONICAL_CLOSE_PAYOUT"), "verified on an independent RPC"],
    ["Relayer", "Gasless trader-signed trades", v("TESTNET_RELAYED_TRADE"), v("TESTNET_RELAYED_TRADE") ? "a signed intent was submitted by the relayer and filled on Perpl" : "pending a relayed testnet trade"],
    ["Keeper", "Automated graduate / enforce", v("TESTNET_KEEPER_ACTION"), v("TESTNET_KEEPER_ACTION") ? "the keeper sent a contract-accepted action" : "running; no desk has needed an action yet"],
    ["Graduation", "Genuine +2% performance on testnet", v("TESTNET_CANONICAL_GRADUATION"), v("TESTNET_CANONICAL_GRADUATION") ? "a desk earned it and the pool funded the credit" : "pending a desk that actually earns it"],
    ["Profit claim", "Qualifying realized profit", v("TESTNET_CANONICAL_CLAIM_PAID"), v("TESTNET_CANONICAL_CLAIM_PAID") ? "paid by contract" : "pending genuine profit"],
    ["Mainnet", "Deployment", false, "not deployed", "not deployed"],
    ["Security audit", "Independent third-party audit", false, "no external audit has been performed", "NOT PERFORMED"],
    ["Internal security review", "Slither, compiler/lint, dependency audit, red-team tests", true, "automated internal review; see docs/SECURITY_REVIEW.md", "complete"],
  ];
  return (
    <ul>
      {items.map(([area, what, ok, note, label]) => (
        <li key={area} className="flex gap-3 border-t border-line px-4 py-3 first:border-t-0">
          {ok ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-safe" aria-label="verified" /> : <CircleDashed size={17} className="mt-0.5 shrink-0 text-muted" aria-label="pending" />}
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {area} <span className="ml-1 text-xs font-normal text-muted">{label ?? (ok ? "testnet verified" : "pending")}</span>
            </div>
            <div className="mt-0.5 text-xs text-fg-2">
              {what}: {note}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function StatusPage() {
  const { rows, at } = await checks();
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">System status</h1>
        <p className="mt-1 text-sm text-fg-2">
          Live checks for {network.label} (chain {network.chainId}), run when this page loaded at <span className="num">{at}</span>.
        </p>
        <h2 className="mt-6 text-sm font-semibold">Protocol</h2>
        <Card className="mt-2" pad={false}>
          <ProtocolStatus />
        </Card>
        <h2 className="mt-6 text-sm font-semibold">Infrastructure</h2>
        <Card className="mt-2" pad={false}>
          <ul>
            {rows.map((r) => (
              <li key={r.name} className="flex gap-3 border-t border-line px-4 py-3 first:border-t-0">
                {r.state === "up" ? (
                  <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-safe" aria-label="up" />
                ) : r.state === "down" ? (
                  <XCircle size={17} className="mt-0.5 shrink-0 text-breach" aria-label="down" />
                ) : (
                  <CircleDashed size={17} className="mt-0.5 shrink-0 text-muted" aria-label="not configured" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {r.name} <span className="ml-1 text-xs font-normal text-muted">{r.state === "up" ? "operational" : r.state === "down" ? "unavailable" : "not running"}</span>
                  </div>
                  <div className="num mt-0.5 text-xs break-all text-muted">{r.detail}</div>
                </div>
              </li>
            ))}
            <PasskeyCapability />
          </ul>
        </Card>
      </main>
    </div>
  );
}
