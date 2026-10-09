"use client";

import { BadgeCheck, Landmark, ShieldAlert, TriangleAlert } from "lucide-react";
import type { Address } from "viem";
import { DESK_STATUS, deskAbi, deskFactoryAbi, riskLevel, type RiskState } from "@imprest/core";
import { SiteHeader } from "@/components/shell";
import { AddressLink, Card, EmptyState, PageLoading, Pending, Pill, Skeleton, Stat } from "@/components/ui";
import { NotDeployed } from "@/components/gates";
import { usePool, usePoll } from "@/lib/desk";
import { primaryClient } from "@/lib/chain";
import { deployed, network } from "@/lib/env";
import { ausd } from "@/lib/format";

function useDeskBook(total: bigint | undefined) {
  return usePoll(
    deployed && total !== undefined
      ? async () => {
          const pc = primaryClient();
          const n = Number(total > 50n ? 50n : total);
          const out: { desk: Address; r: RiskState }[] = [];
          for (let i = 0; i < n; i++) {
            const idx = total - 1n - BigInt(i); // newest first, bounded to 50
            const desk = (await pc.readContract({
              address: network.imprest.factory!,
              abi: deskFactoryAbi,
              functionName: "allDesks",
              args: [idx],
            })) as Address;
            const r = (await pc.readContract({
              address: desk,
              abi: deskAbi,
              functionName: "riskState",
            })) as unknown as RiskState;
            out.push({ desk, r });
          }
          return out;
        }
      : null,
    20_000,
    `deskbook:${total}`,
  );
}

export default function LpConsole() {
  const pool = usePool();
  const p = pool.data;
  const book = useDeskBook(p?.deskTotal);
  const desks = book.data ?? [];
  const active = desks.filter((x) => x.r.status === 0);
  const funded = active.filter((x) => x.r.borrowed > 0n);
  const stakes = active.reduce((a, x) => a + x.r.originalStake, 0n);
  const feeLiab = active.reduce((a, x) => a + x.r.feeOutstanding, 0n);
  const atRisk = funded.reduce((a, x) => {
    const shortfall = x.r.borrowed - (x.r.equity > 0n ? x.r.equity : 0n);
    return a + (shortfall > 0n ? shortfall : 0n);
  }, 0n);

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Landmark size={22} aria-hidden className="text-accent" /> LP risk console
            </h1>
            <p className="mt-1 text-sm text-fg-2">
              Pool state read from chain. Money values are confirmed on a second RPC at the same block.
            </p>
          </div>
          {p && (
            <div className="flex items-center gap-2 text-xs">
              {p.confirmedOnSecondRpc ? (
                <Pill tone="safe" icon={BadgeCheck}>
                  confirmed on 2 RPCs at block {p.blockNumber.toString()}
                </Pill>
              ) : p.confirmedOnSecondRpc === false ? (
                <Pill tone="breach" icon={TriangleAlert}>
                  second RPC disagrees: not confirmed
                </Pill>
              ) : (
                <Pill tone="warn">single RPC only</Pill>
              )}
            </div>
          )}
        </div>

        {!deployed ? (
          <div className="mt-6">
            <NotDeployed />
          </div>
        ) : !p && pool.error ? (
          <div className="mt-6">
            <EmptyState title="Pool data unavailable right now">
              Neither Monad testnet RPC answered ({pool.error.split("\n")[0]?.slice(0, 120)}). Nothing is
              shown in its place. Retrying every 10 seconds.
            </EmptyState>
          </div>
        ) : !p ? (
          <PageLoading label="Reading the pool from chain and confirming on a second RPC…" />
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            <section
              aria-label="Pool totals"
              className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line md:grid-cols-4"
            >
              {[
                <Stat key="ta" label="Total pool assets" value={ausd(p.totalAssets)} unit="AUSD" size="lg" />,
                <Stat key="dp" label="Deployed principal" value={ausd(p.deployed)} unit="AUSD" />,
                <Stat
                  key="id"
                  label="Idle capital"
                  value={ausd(p.idle)}
                  unit="AUSD"
                  sub="withdrawable by LPs"
                />,
                <Stat
                  key="ad"
                  label="Active desks"
                  value={book.data ? `${active.length}` : null}
                  sub={book.data ? `${funded.length} funded · ${p.deskTotal} opened` : undefined}
                />,
                <Stat
                  key="pr"
                  label="Principal at risk"
                  value={book.data ? ausd(atRisk) : null}
                  unit="AUSD"
                  tone={atRisk > 0n ? "breach" : undefined}
                  sub="borrowed minus equity, funded desks"
                />,
                <Stat
                  key="ts"
                  label="Trader stakes (first loss)"
                  value={book.data ? ausd(stakes) : null}
                  unit="AUSD"
                />,
                <Stat
                  key="fl"
                  label="Fee liabilities outstanding"
                  value={book.data ? ausd(feeLiab, 4) : null}
                  unit="AUSD"
                  sub="not income until collected"
                />,
                <Stat key="ps" label="Desk notional cap" value={ausd(p.deskNotionalCap)} unit="AUSD" />,
                <Stat key="fc" label="Fees collected" value={ausd(p.feesCollected, 4)} unit="AUSD" />,
                <Stat key="fw" label="Fees written off" value={ausd(p.feesWrittenOff, 4)} unit="AUSD" />,
                <Stat
                  key="pl"
                  label="Principal losses"
                  value={ausd(p.principalLoss)}
                  unit="AUSD"
                  tone={p.principalLoss > 0n ? "breach" : undefined}
                />,
                <Stat key="pi" label="Pool profit share" value={ausd(p.profitShare)} unit="AUSD" />,
                <Stat key="ld" label="LP deposits" value={ausd(p.lpDeposited)} unit="AUSD" />,
                <Stat key="lw" label="LP withdrawals" value={ausd(p.lpWithdrawn)} unit="AUSD" />,
                <Stat key="kp" label="Keeper payouts" value={null} sub="from settlement events (indexer)" />,
                <Stat
                  key="pp"
                  label="Status"
                  value={p.paused ? "Paused (new credit)" : "Open"}
                  tone={p.paused ? "warn" : "safe"}
                />,
              ].map((x, i) => (
                <div key={i} className="bg-surface p-3">
                  {x}
                </div>
              ))}
            </section>

            <Card title="Gross funded exposure by market">
              <div className="grid gap-4 sm:grid-cols-2">
                {p.exposure.map((x) => {
                  const pct = x.cap > 0n ? Number(x.gross) / Number(x.cap) : 0;
                  return (
                    <div key={x.perpId}>
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold">{x.symbol}-PERP</span>
                        <span className="num">
                          {ausd(x.gross)} / {ausd(x.cap)} AUSD
                        </span>
                      </div>
                      <div
                        className="mt-1.5 h-2 rounded-full bg-surface-3"
                        role="progressbar"
                        aria-valuenow={Math.round(pct * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${x.symbol} exposure`}
                      >
                        <div
                          className={
                            pct >= 1
                              ? "h-2 rounded-full bg-breach"
                              : pct > 0.75
                                ? "h-2 rounded-full bg-warn"
                                : "h-2 rounded-full bg-accent"
                          }
                          style={{ width: `${Math.min(100, pct * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-muted">
                Recorded by desks in the same transaction as each trade; increases past a cap revert before
                reaching Perpl.
              </p>
            </Card>

            <Card title="Desks (newest 50)" pad={false}>
              {!book.data ? (
                <Skeleton className="m-4 h-24" />
              ) : desks.length === 0 ? (
                <EmptyState title="No desks yet" />
              ) : (
                <>
                  <ul className="divide-y divide-line md:hidden">
                    {desks.map(({ desk, r }) => {
                      const lvl = riskLevel(r);
                      return (
                        <li key={desk} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <AddressLink address={desk} />
                            {r.status !== 0 ? (
                              <Pill tone="info">{DESK_STATUS[r.status]}</Pill>
                            ) : lvl === "breach" ? (
                              <Pill tone="breach" icon={ShieldAlert}>
                                breach
                              </Pill>
                            ) : lvl === "warning" ? (
                              <Pill tone="warn">near floor</Pill>
                            ) : (
                              <Pill tone="safe">healthy</Pill>
                            )}
                          </div>
                          <dl className="num mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
                            <dt className="font-sans text-muted">Tier · status</dt>
                            <dd className="text-right">
                              {r.tier} · {DESK_STATUS[r.status]}
                            </dd>
                            <dt className="font-sans text-muted">Equity</dt>
                            <dd className="text-right">{ausd(r.equity)}</dd>
                            <dt className="font-sans text-muted">Floor (distance)</dt>
                            <dd className="text-right">
                              {ausd(r.floor)} ({ausd(r.equity - r.floor)})
                            </dd>
                            <dt className="font-sans text-muted">Borrowed</dt>
                            <dd className="text-right">{ausd(r.borrowed)}</dd>
                            <dt className="font-sans text-muted">Fee liability</dt>
                            <dd className="text-right">{ausd(r.feeOutstanding, 4)}</dd>
                          </dl>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[820px] text-sm">
                      <caption className="sr-only">Desks</caption>
                      <thead className="text-left text-[11px] tracking-wide text-muted uppercase">
                        <tr>
                          {[
                            "Desk",
                            "Status",
                            "Tier",
                            "Equity",
                            "Floor",
                            "Distance",
                            "Borrowed",
                            "Fee liability",
                            "Risk",
                          ].map((h) => (
                            <th key={h} scope="col" className="px-3 py-2 font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="num">
                        {desks.map(({ desk, r }) => {
                          const lvl = riskLevel(r);
                          return (
                            <tr key={desk} className="border-t border-line">
                              <td className="px-3 py-2">
                                <AddressLink address={desk} />
                              </td>
                              <td className="px-3 py-2 font-sans">{DESK_STATUS[r.status]}</td>
                              <td className="px-3 py-2">{r.tier}</td>
                              <td className="px-3 py-2">{ausd(r.equity)}</td>
                              <td className="px-3 py-2">{ausd(r.floor)}</td>
                              <td className="px-3 py-2">{ausd(r.equity - r.floor)}</td>
                              <td className="px-3 py-2">{ausd(r.borrowed)}</td>
                              <td className="px-3 py-2">{ausd(r.feeOutstanding, 4)}</td>
                              <td className="px-3 py-2 font-sans">
                                {r.status !== 0 ? (
                                  <Pill tone="info">{DESK_STATUS[r.status]}</Pill>
                                ) : lvl === "breach" ? (
                                  <Pill tone="breach" icon={ShieldAlert}>
                                    breach
                                  </Pill>
                                ) : lvl === "warning" ? (
                                  <Pill tone="warn">near floor</Pill>
                                ) : (
                                  <Pill tone="safe">healthy</Pill>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>

            <Card title="Settlement events">
              <div className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
                Settlement and keeper history is served by the Envio indexer.{" "}
                <Pending label="PENDING: indexer deployment" />
              </div>
            </Card>
            <p className="text-[11px] text-muted">
              {network.label} · pool <span className="num">{network.imprest.pool}</span>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
