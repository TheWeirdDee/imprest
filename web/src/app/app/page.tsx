"use client";

import Link from "next/link";
import { Activity, ArrowRight, Gauge, Layers, Wallet } from "lucide-react";
import { DESK_STATUS, formatUnitsFixed } from "@imprest/core";
import { hasAccount, useAccount } from "@/lib/account/AccountProvider";
import { useDesk } from "@/lib/desk-context";
import { deployed, network } from "@/lib/env";
import { ausd, signedAusd } from "@/lib/format";
import { summarize } from "@/lib/summary";
import { AddressLink, Card, Pill, Skeleton, Stat } from "@/components/ui";
import { NotDeployed, SignInPrompt, RequireDesk } from "@/components/gates";
import { RiskMeter } from "@/components/risk-meter";
import { PositionsTable } from "@/components/positions-table";
import { HistoryList } from "@/components/history";
import { Portfolio } from "@/components/portfolio";

export default function Dashboard() {
  const a = useAccount();
  const d = useDesk();
  const r = d.risk.data;
  const p = d.policy.data;
  const s = r ? summarize(r, p, d.positions.data) : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted">
            Your desk on Perpl {network.label.toLowerCase()}, read directly from chain.
          </p>
        </div>
        <Link
          href="/app/trade/btc"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
        >
          Open terminal <ArrowRight size={14} aria-hidden />
        </Link>
      </div>

      {!deployed && <NotDeployed />}
      {deployed && !a.ready && <Skeleton className="h-28 w-full" />}
      {deployed && a.ready && !hasAccount(a) && <SignInPrompt reason="Sign in to see your desk." />}

      {r && s && (
        <section
          aria-label="Account summary"
          className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line sm:grid-cols-3 lg:grid-cols-6"
        >
          {[
            <Stat
              key="eq"
              label="Equity"
              value={ausd(r.equity)}
              unit="AUSD"
              size="lg"
              sub={`economic ${ausd(s.economicEquity)} after fees`}
            />,
            <Stat
              key="av"
              label="Available"
              value={ausd(s.available)}
              unit="AUSD"
              sub="free margin in Perpl"
            />,
            <Stat
              key="uc"
              label="Restricted credit"
              value={ausd(s.usedCredit)}
              unit="AUSD"
              sub={r.borrowed > 0n ? `of ${ausd(s.deskSize)} desk` : "evaluation: no credit"}
            />,
            <Stat
              key="up"
              label="Unrealized PnL"
              value={signedAusd(s.unrealized)}
              unit="AUSD"
              tone={s.unrealized >= 0n ? "safe" : "breach"}
              sub="not claimable"
            />,
            <Stat
              key="rp"
              label="Realized PnL"
              value={signedAusd(s.realized)}
              unit="AUSD"
              tone={s.realized >= 0n ? "safe" : "breach"}
              sub="this tier"
            />,
            <Stat
              key="rb"
              label="Risk buffer"
              value={ausd(s.riskBuffer)}
              unit="AUSD"
              tone={s.riskBuffer > 0n ? undefined : "breach"}
              sub="equity minus floor"
            />,
            <Stat key="tr" label="Current tier" value={s.tierName} sub={p?.demo ? "demo cohort" : p?.name} />,
            <Stat
              key="dl"
              label="Daily loss remaining"
              value={s.dailyRemaining === null ? "no trade today" : ausd(s.dailyRemaining)}
              unit={s.dailyRemaining === null ? undefined : "AUSD"}
            />,
            <Stat
              key="ml"
              label="Max leverage"
              value={p ? `${(p.maxLeverageHdths / 100).toFixed(2)}x` : null}
            />,
            <Stat
              key="fa"
              label="Accrued credit fee"
              value={ausd(r.feeOutstanding, 4)}
              unit="AUSD"
              sub={r.borrowed > 0n ? "accrues only while exposed" : "none in evaluation"}
            />,
            <Stat
              key="fc"
              label="Fee cap remaining"
              value={ausd(s.feeCapRemaining)}
              unit="AUSD"
              sub={`cap ${ausd(r.feeCap)}`}
            />,
            <Stat
              key="st"
              label="Desk status"
              value={DESK_STATUS[r.status]}
              tone={r.status === 0 ? "safe" : "breach"}
            />,
          ].map((x, i) => (
            <div key={i} className="bg-surface p-3">
              {x}
            </div>
          ))}
        </section>
      )}
      {deployed && hasAccount(a) && d.desk && !r && <Skeleton className="h-28 w-full" />}

      {/* Signed out: one sign-in prompt above, not one per card. */}
      {(hasAccount(a) || !deployed) && (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Portfolio" icon={Wallet}>
              <Portfolio />
            </Card>
            <Card title="Current desk" icon={Layers} className="lg:col-span-2">
              <RequireDesk what="your desk">
                {r && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-muted">Desk</span> {d.desk && <AddressLink address={d.desk} />}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted">Perpl account</span>{" "}
                        <span className="num">#{r.accountId.toString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted">Cohort</span> {p?.name}{" "}
                        {p?.demo && <Pill tone="warn">demo cohort</Pill>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted">Stake</span>{" "}
                        <span className="num">{ausd(r.originalStake)} AUSD</span>
                      </div>
                    </div>
                    <div>
                      <RiskMeter r={r} compact />
                    </div>
                  </div>
                )}
              </RequireDesk>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Position" icon={Activity} className="lg:col-span-2" pad={false}>
              <RequireDesk what="positions">
                <PositionsTable compact />
              </RequireDesk>
            </Card>
            <Card title="Payout eligibility" icon={Gauge}>
              <RequireDesk what="payout eligibility">
                {r && s && (
                  <div className="space-y-2 text-sm">
                    {!r.flat ? (
                      <Pill tone="warn">Claim blocked: close all positions first</Pill>
                    ) : s.claimable && s.claimable.gross > 0n ? (
                      <Pill tone="safe">Eligible now</Pill>
                    ) : (
                      <Pill tone="info">Nothing above the high-water mark</Pill>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted">High-water mark</span>
                      <span className="num">{ausd(r.hwm)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Your share if claimed now</span>
                      <span className="num">
                        {s.claimable ? ausd(s.claimable.traderShare) : "requires flat desk"}
                      </span>
                    </div>
                    <Link href="/app/claims" className="inline-block text-accent hover:underline">
                      Claims
                    </Link>
                  </div>
                )}
              </RequireDesk>
            </Card>
          </div>

          <Card title="Recent activity" pad={false}>
            <RequireDesk what="activity">
              <HistoryList />
            </RequireDesk>
          </Card>
        </>
      )}
      {r && (
        <p className="text-[11px] text-muted">
          Leverage cap {p ? formatUnitsFixed(BigInt(p.maxLeverageHdths), 2, 2) : "—"}x, price band{" "}
          {p?.priceBandBps} bps and loss limits are enforced by the desk contract on every order.
        </p>
      )}
    </div>
  );
}
