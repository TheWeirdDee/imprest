"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Circle, GraduationCap, Layers, PlusCircle } from "lucide-react";
import { TIER_NAMES, parseUnitsStrict, perplExchangeAbi, type CohortPolicy } from "@imprest/core";
import { useAccount } from "@/lib/account/AccountProvider";
import { useDesk } from "@/lib/desk-context";
import { useCohorts, usePoll } from "@/lib/desk";
import { deployed, network } from "@/lib/env";
import { primaryClient } from "@/lib/chain";
import { approveAction, graduateAction, openDeskAction } from "@/lib/actions";
import { useAction } from "@/lib/tx";
import { ausd } from "@/lib/format";
import { Button, Card, Notice, Pending, Pill, Skeleton, cx } from "@/components/ui";
import { NotDeployed, SignInPrompt } from "@/components/gates";
import { TxStatus } from "@/components/tx-status";

function TierTable({ p, current }: { p: CohortPolicy; current?: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[820px] text-sm">
        <caption className="sr-only">Tiers configured for cohort {p.name}</caption>
        <thead className="bg-surface-2 text-left text-[11px] tracking-wide text-muted uppercase">
          <tr>
            {["Tier", "Requirement", "Desk size", "Stake share", "Credit", "Credit fee", "Trader split", "Drawdown", "Daily loss", "Leverage"].map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="num">
          {p.tiers.map((t, i) => (
            <tr key={i} className={cx("border-t border-line", current === i && "bg-surface-3")}>
              <td className="px-3 py-2 font-sans font-semibold">
                {TIER_NAMES[i]} {current === i && <span className="ml-1 text-[10px] text-accent">current</span>}
              </td>
              <td className="px-3 py-2 font-sans text-fg-2">
                {i === 0
                  ? `stake at least ${ausd(p.minStake)} AUSD`
                  : [
                      t.gradProfitBps ? `+${t.gradProfitBps / 100}% equity` : null,
                      t.gradMinClosedTrades ? `${t.gradMinClosedTrades} closed trades` : null,
                      t.gradMinSeconds ? `${t.gradMinSeconds / 3600}h in tier` : null,
                      t.gradMinClaims ? `${t.gradMinClaims} paid-out claim` : null,
                    ]
                      .filter(Boolean)
                      .join(", ") || "none"}
              </td>
              <td className="px-3 py-2">{t.sizeMultiple}x stake</td>
              <td className="px-3 py-2">{(100 / t.sizeMultiple).toFixed(0)}%</td>
              <td className="px-3 py-2">{t.sizeMultiple - 1}x stake</td>
              <td className="px-3 py-2">{t.feeRatePpmPerDay ? `${(t.feeRatePpmPerDay / 10_000).toFixed(2)}%/day exposed` : "none"}</td>
              <td className="px-3 py-2">{t.traderSplitBps / 100}%</td>
              <td className="px-3 py-2">{p.maxDrawdownBps / 100}%</td>
              <td className="px-3 py-2">{p.dailyLossBps / 100}%</td>
              <td className="px-3 py-2">{p.maxLeverageHdths / 100}x</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Progress({ label, have, need, unit }: { label: string; have: number; need: number; unit: string }) {
  const done = have >= need;
  const pctDone = need === 0 ? 1 : Math.max(0, Math.min(1, have / need));
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5">
          {done ? <CheckCircle2 size={14} className="text-safe" aria-hidden /> : <Circle size={14} className="text-muted" aria-hidden />}
          {label}
        </span>
        <span className="num text-fg-2">
          {have.toFixed(unit === "%" ? 2 : 0)}
          {unit} / {need}
          {unit}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(pctDone * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cx("h-1.5 rounded-full", done ? "bg-safe" : "bg-accent")} style={{ width: `${pctDone * 100}%` }} />
      </div>
    </div>
  );
}

function OpenDesk() {
  const a = useAccount();
  const d = useDesk();
  const cohorts = useCohorts();
  const venueMin = usePoll(
    network.perpl.exchange ? async () => (await primaryClient().readContract({ address: network.perpl.exchange!, abi: perplExchangeAbi as any, functionName: "getMinAccountOpenCNS" })) as bigint : null,
    120_000,
    "venueMin",
  );
  const [cohortId, setCohortId] = useState(0);
  const [stakeStr, setStakeStr] = useState("100");
  const { state, run, reset } = useAction();
  const c = cohorts.data?.find((x) => x.id === cohortId);
  let stake = 0n;
  try {
    stake = parseUnitsStrict(stakeStr, 6);
  } catch {
    stake = 0n;
  }
  const min = c && venueMin.data ? (c.policy.minStake > venueMin.data ? c.policy.minStake : venueMin.data) : null;
  const tooLow = min !== null && stake < min;
  const noFunds = d.balances.data ? d.balances.data.ausd < stake : false;
  const busy = state.kind === "requested" || state.kind === "submitted" || state.kind === "confirming";
  return (
    <Card title="Open an evaluation desk" icon={PlusCircle}>
      {!cohorts.data ? (
        <Skeleton className="h-24" />
      ) : (
        <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-[11px] tracking-wide text-muted uppercase">Cohort</span>
              <select value={cohortId} onChange={(e) => setCohortId(Number(e.target.value))} className="mt-1 w-full rounded-md border border-line-strong bg-surface-2 px-3 py-2">
                {cohorts.data.filter((x) => x.active).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.policy.name}
                    {x.policy.demo ? " (demo: +2%, 2 trades, no time minimum)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[11px] tracking-wide text-muted uppercase">Stake (AUSD)</span>
              <input value={stakeStr} onChange={(e) => setStakeStr(e.target.value)} inputMode="decimal" className="num mt-1 w-full rounded-md border border-line-strong bg-surface-2 px-3 py-2" />
              <span className="mt-1 block text-xs text-muted">
                Minimum {min !== null ? ausd(min) : "…"} AUSD (the larger of the cohort minimum and Perpl&apos;s account-open minimum).
              </span>
            </label>
            {tooLow && <Notice tone="warn" title="Stake below minimum" />}
            {noFunds && <Notice tone="warn" title="Not enough AUSD in your wallet">Use the faucet on the dashboard first.</Notice>}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={busy || !a.account || stake === 0n} onClick={() => void run(approveAction(a.account!, network.imprest.factory!, stake))}>
                1. Approve AUSD
              </Button>
              <Button
                disabled={busy || !a.account || tooLow || noFunds || stake === 0n}
                onClick={async () => {
                  await run(openDeskAction(a.account!, stake, cohortId));
                  d.refreshAll();
                }}
              >
                2. Open desk <ArrowRight size={14} aria-hidden />
              </Button>
            </div>
            <TxStatus state={state} onReset={reset} />
          </div>
          <div className="text-sm text-fg-2">
            <p>The factory deploys your own desk contract and opens a Perpl account owned by it with the full stake. You trade it; the desk enforces the policy.</p>
            {c && (
              <ul className="mt-3 space-y-1 text-xs">
                <li>Floor: {c.policy.maxDrawdownBps / 100}% below start equity. Daily loss: {c.policy.dailyLossBps / 100}%.</li>
                <li>Leverage at most {c.policy.maxLeverageHdths / 100}x; price within {c.policy.priceBandBps} bps of mark; IOC or FOK only.</li>
                <li>Keeper bounty on enforced settlement: {ausd(c.policy.keeperBounty)} AUSD from residual equity, paid once.</li>
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function DeskPage() {
  const a = useAccount();
  const d = useDesk();
  const cohorts = useCohorts();
  const { state, run, reset } = useAction();
  const r = d.risk.data;
  const p = d.policy.data;

  if (!deployed) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <h1 className="text-xl font-semibold">Desk</h1>
        <NotDeployed />
        <Card title="Lifecycle">
          <p className="text-sm text-fg-2">
            Tiers are displayed only once they are configured onchain for {network.label}. Configured tiers: <Pending />
          </p>
        </Card>
      </div>
    );
  }

  const next = r && p && r.tier + 1 < p.tierCount ? p.tiers[r.tier + 1] : null;
  const gainPct = r ? (Number(r.equity - r.startEquity) / Number(r.startEquity)) * 100 : 0;
  const hoursInTier = r ? (Date.now() / 1000 - Number(r.tierStartTs)) / 3600 : 0;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Desk</h1>
      {a.status !== "ready" && <SignInPrompt reason="Sign in to open or manage a desk." />}

      {a.status === "ready" && (!d.desk || (r && r.status === 2)) && <OpenDesk />}

      {r && p && (
        <>
          <Card title="Lifecycle" icon={Layers}>
            <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Desk lifecycle">
              {p.tiers.map((_, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className={cx("rounded-full border px-3 py-1", i < r.tier ? "border-safe/40 text-safe" : i === r.tier ? "border-accent bg-surface-3 text-fg" : "border-line text-muted")}>
                    {TIER_NAMES[i]}
                  </span>
                  {i < p.tiers.length - 1 && <ArrowRight size={14} aria-hidden className="text-muted" />}
                </li>
              ))}
              {r.status !== 0 && <Pill tone="breach">{r.status === 1 ? "Enforcing (reduce-only)" : "Closed"}</Pill>}
            </ol>
          </Card>

          {next ? (
            <Card title={`Progress to ${TIER_NAMES[r.tier + 1]}`} icon={GraduationCap}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <Progress label="Equity gain over tier start" have={gainPct} need={next.gradProfitBps / 100} unit="%" />
                  <Progress label="Closed round trips" have={Number(r.closedTradesThisTier)} need={next.gradMinClosedTrades} unit="" />
                  {next.gradMinSeconds > 0 && <Progress label="Hours in tier" have={hoursInTier} need={next.gradMinSeconds / 3600} unit="h" />}
                  {next.gradMinClaims > 0 && <Progress label="Paid-out claims" have={Number(r.claimsThisTier)} need={next.gradMinClaims} unit="" />}
                  <div className="flex items-center gap-2 text-sm">
                    {r.flat ? <CheckCircle2 size={14} className="text-safe" aria-hidden /> : <Circle size={14} className="text-muted" aria-hidden />}
                    Desk is flat
                  </div>
                </div>
                <div className="space-y-3 text-sm">
                  <p className="text-fg-2">
                    Graduation is permissionless: anyone can call it, and the desk contract decides from its own state. A premature call
                    reverts onchain with the unmet rule.
                  </p>
                  <p>
                    On graduation the pool lends <span className="num">{ausd(r.originalStake * BigInt(next.sizeMultiple - 1) - r.borrowed)}</span> AUSD, making a{" "}
                    <span className="num">{ausd(r.originalStake * BigInt(next.sizeMultiple))}</span> AUSD desk.
                  </p>
                  <Button
                    disabled={!a.account || state.kind === "submitted" || state.kind === "confirming"}
                    onClick={async () => {
                      await run(graduateAction(a.account!, d.desk!, r, p));
                      d.refreshAll();
                    }}
                  >
                    <GraduationCap size={15} aria-hidden /> Graduate
                  </Button>
                  <TxStatus state={state} onReset={reset} />
                </div>
              </div>
            </Card>
          ) : (
            <Card title="Progress">
              <p className="text-sm text-fg-2">This desk is at the top tier its cohort configures.</p>
            </Card>
          )}

          <Card title={`Tiers configured for ${p.name}${p.demo ? " (labeled demo cohort)" : ""}`}>
            <TierTable p={p} current={r.tier} />
          </Card>
        </>
      )}

      {!r && cohorts.data && (
        <div className="space-y-4">
          {cohorts.data.map((c) => (
            <Card key={c.id} title={`Tiers configured for ${c.policy.name}${c.policy.demo ? " (labeled demo cohort)" : ""}`}>
              <TierTable p={c.policy} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
