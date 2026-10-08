"use client";

import { Gauge, ShieldAlert } from "lucide-react";
import { DESK_STATUS, ENFORCE_REASON, INT256_MIN, notional, riskLevel } from "@imprest/core";
import { hasAccount, useAccount } from "@/lib/account/AccountProvider";
import { useDesk } from "@/lib/desk-context";
import { usePool } from "@/lib/desk";
import { network } from "@/lib/env";
import { enforceAction } from "@/lib/actions";
import { useAction } from "@/lib/tx";
import { ausd } from "@/lib/format";
import { Button, Card, KV, Notice, Pill, Stat } from "@/components/ui";
import { RequireDesk } from "@/components/gates";
import { RiskMeter } from "@/components/risk-meter";
import { TxStatus } from "@/components/tx-status";

function Bar({ value, max, tone }: { value: bigint; max: bigint; tone: "safe" | "warn" | "breach" }) {
  const p = max > 0n ? Math.min(1, Number(value) / Number(max)) : 0;
  const c = tone === "breach" ? "bg-breach" : tone === "warn" ? "bg-warn" : "bg-accent";
  return (
    <div className="h-1.5 rounded-full bg-surface-3" aria-hidden>
      <div className={`h-1.5 rounded-full ${c}`} style={{ width: `${p * 100}%` }} />
    </div>
  );
}

export default function RiskCenter() {
  const a = useAccount();
  const d = useDesk();
  const pool = usePool();
  const { state, run, reset } = useAction();
  const r = d.risk.data;
  const p = d.policy.data;
  const open = (d.positions.data ?? []).filter((x) => x.lots > 0n);
  const gross = open.reduce((acc, x) => acc + notional(network.perpl.markets.find((m) => m.perpId === x.perpId)!, x.lots, x.markPns), 0n);
  const eqForLev = r && r.equity > 0n ? r.equity : 1n;
  const effLev = r ? Number(gross) / Number(eqForLev) : 0;
  const dailyUsed = r && r.dailyFloor !== INT256_MIN ? r.dayStartEquity - r.equity : null;
  const dailyLimit = r && p ? (r.dayStartEquity * BigInt(p.dailyLossBps)) / 10_000n : null;
  const level = r ? riskLevel(r) : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <Gauge size={20} aria-hidden className="text-accent" /> Risk center
      </h1>
      <RequireDesk what="your risk">
        {r && p && (
          <>
            <Card title="How close am I to losing my desk?">
              <RiskMeter r={r} />
            </Card>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card title="Loss limits">
                <KV k="Start equity" v={ausd(r.startEquity)} />
                <KV k="Current equity" v={ausd(r.equity)} />
                <KV k="Risk floor" v={ausd(r.floor)} />
                <KV k="Distance to floor" v={ausd(r.equity - r.floor)} />
                <div className="mt-2 border-t border-line pt-2">
                  <KV k="Daily loss limit" v={dailyLimit !== null && r.dailyFloor !== INT256_MIN ? ausd(dailyLimit) : "set at first trade today"} />
                  <KV k="Daily loss used" v={dailyUsed === null ? "0.00 (no trade today)" : ausd(dailyUsed > 0n ? dailyUsed : 0n)} />
                  {dailyUsed !== null && dailyLimit !== null && <Bar value={dailyUsed > 0n ? dailyUsed : 0n} max={dailyLimit} tone={dailyUsed >= dailyLimit ? "breach" : "warn"} />}
                </div>
              </Card>
              <Card title="Leverage and exposure">
                <Stat label="Effective leverage" value={`${effLev.toFixed(2)}x`} tone={effLev > p.maxLeverageHdths / 100 ? "warn" : undefined} sub={`max ${(p.maxLeverageHdths / 100).toFixed(2)}x per order`} />
                <div className="mt-3">
                  <KV k="Desk gross notional" v={ausd(gross)} />
                  <KV k="Per-desk notional cap" v={pool.data ? ausd(pool.data.deskNotionalCap) : "—"} />
                  {pool.data && <Bar value={gross} max={pool.data.deskNotionalCap} tone="safe" />}
                </div>
              </Card>
              <Card title="Credit">
                <KV k="Restricted credit" v={ausd(r.borrowed)} />
                <KV k="Desk size" v={ausd(r.originalStake + r.borrowed)} />
                <KV k="Your first-loss stake" v={ausd(r.originalStake)} />
                <div className="mt-2 border-t border-line pt-2">
                  <KV k="Fee liability" v={ausd(r.feeOutstanding, 4)} />
                  <KV k="Fee cap" v={ausd(r.feeCap)} />
                  <Bar value={r.feeOutstanding} max={r.feeCap} tone={r.feeOutstanding >= r.feeCap ? "breach" : "safe"} />
                  <p className="mt-1.5 text-[11px] text-muted">Fees are a separate liability, not deducted from risk equity. Reaching the cap stops new risk.</p>
                </div>
              </Card>
              <Card title="Execution">
                <KV k="Desk status" v={DESK_STATUS[r.status]} />
                <KV k="Enforcement reason" v={ENFORCE_REASON[r.enforceReason]} />
                <KV k="Mark validity" v={r.markValid ? <Pill tone="safe">valid</Pill> : <Pill tone="breach">stale</Pill>} />
                <KV k="Open positions" v={open.length} />
                <KV k="Signed orders used" v={r.lastNonce.toString()} />
              </Card>
            </div>

            {pool.data && (
              <Card title="Pool exposure (gross funded, all desks)">
                <div className="grid gap-4 sm:grid-cols-2">
                  {pool.data.exposure.map((x) => (
                    <div key={x.perpId}>
                      <div className="flex justify-between text-sm">
                        <span>{x.symbol}</span>
                        <span className="num">
                          {ausd(x.gross)} / {ausd(x.cap)}
                        </span>
                      </div>
                      <Bar value={x.gross} max={x.cap} tone={x.gross >= x.cap ? "breach" : "safe"} />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted">An order that would push gross exposure past the cap reverts before it reaches Perpl.</p>
              </Card>
            )}

            {level === "breach" && r.status === 0 && (
              <Card title="Enforcement" icon={ShieldAlert}>
                <Notice tone="breach" title="This desk is below a loss limit">
                  Anyone can call enforce(): it closes positions reduce-only and settles under the waterfall. You can call it yourself;
                  a keeper bounty is paid from residual equity to whoever finalizes it.
                </Notice>
                <Button variant="danger" className="mt-3" disabled={!hasAccount(a)} onClick={() => void run(async () => enforceAction(await a.getSigner(), d.desk!))}>
                  Call enforce()
                </Button>
                <div className="mt-3">
                  <TxStatus state={state} onReset={reset} />
                </div>
              </Card>
            )}
          </>
        )}
      </RequireDesk>
    </div>
  );
}
