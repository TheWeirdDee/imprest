"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, CircleHelp, FlaskConical, ShieldAlert, ShieldCheck, Send } from "lucide-react";
import {
  checkPolicy,
  deskAbi,
  formatUnitsFixed,
  notional as notionalOf,
  parseUnitsStrict,
  perplExchangeAbi,
  type MarketConfig,
  type OrderIntent,
} from "@imprest/core";
import { useAccount } from "@/lib/account/AccountProvider";
import { useDesk } from "@/lib/desk-context";
import { usePoll } from "@/lib/desk";
import { deployed, network, relayerUrl } from "@/lib/env";
import { primaryClient } from "@/lib/chain";
import { tradeAction } from "@/lib/actions";
import { sendWriteUnchecked, useAction } from "@/lib/tx";
import { ausd } from "@/lib/format";
import { Button, Notice, cx } from "./ui";
import { TxStatus } from "./tx-status";

const BPS = 10_000n;

function useTakerFeePpm(m: MarketConfig) {
  return usePoll(
    network.perpl.exchange
      ? async () =>
          (await primaryClient().readContract({
            address: network.perpl.exchange!,
            abi: perplExchangeAbi as any,
            functionName: "getTakerFee",
            args: [BigInt(m.perpId)],
          })) as bigint
      : null,
    120_000,
    `fee:${m.perpId}`,
  );
}

export function OrderTicket({ m, tickerMark }: { m: MarketConfig; tickerMark: number | null }) {
  const a = useAccount();
  const d = useDesk();
  const fee = useTakerFeePpm(m);
  const { state, run, reset } = useAction();
  const [side, setSide] = useState<0 | 1>(0);
  const [fok, setFok] = useState(false);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [size, setSize] = useState("0.001");
  const [lev, setLev] = useState(3);
  const [priceStr, setPriceStr] = useState<string | null>(null);
  const [via, setVia] = useState<"self" | "relayer">(relayerUrl ? "relayer" : "self");

  const risk = d.risk.data;
  const policy = d.policy.data;
  const pos = d.positions.data?.find((p) => p.perpId === m.perpId) ?? null;
  // Chain mark (Perpl getPosition) is authoritative for the desk; the API ticker is a fallback for display.
  const markPns: bigint | null = pos?.markPns && pos.markPns > 0n ? pos.markPns : tickerMark !== null ? BigInt(Math.round(tickerMark)) : null;
  const markValid = pos ? pos.markValid : true;
  const maxLev = policy ? policy.maxLeverageHdths / 100 : 5;

  // Default price: marketable inside the band (0.2% through mark) until the user edits it.
  const defaultPrice = markPns === null ? null : side === 0 ? markPns + (markPns * 20n) / BPS : markPns - (markPns * 20n) / BPS;
  useEffect(() => setPriceStr(null), [side, m.perpId]);
  const priceText = priceStr ?? (defaultPrice !== null ? formatUnitsFixed(defaultPrice, m.priceDecimals, m.priceDecimals).replace(/,/g, "") : "");

  const parsed = useMemo(() => {
    try {
      const priceLimit = parseUnitsStrict(priceText, m.priceDecimals);
      const lots = parseUnitsStrict(size, m.lotDecimals);
      return { priceLimit, lots, error: null as string | null };
    } catch (e) {
      return { priceLimit: 0n, lots: 0n, error: (e as Error).message };
    }
  }, [priceText, size, m.priceDecimals, m.lotDecimals]);

  const order: OrderIntent = {
    perpId: BigInt(m.perpId),
    side,
    priceLimit: parsed.priceLimit,
    lots: parsed.lots,
    leverage: BigInt(Math.round(lev * 100)),
    reduceOnly,
    fillOrKill: fok,
  };

  const notional = parsed.error ? 0n : notionalOf(m, parsed.lots, parsed.priceLimit);
  const margin = lev > 0 ? (notional * 100n) / BigInt(Math.round(lev * 100)) : 0n;
  const feeEst = fee.data !== null && fee.data !== undefined ? (notional * fee.data) / 1_000_000n : null;
  const crossCost = markPns && parsed.lots > 0n ? notionalOf(m, parsed.lots, parsed.priceLimit > markPns ? parsed.priceLimit - markPns : markPns - parsed.priceLimit) : 0n;
  const postEquity = risk && feeEst !== null ? risk.equity - feeEst : null;
  const distanceAfter = risk && postEquity !== null ? postEquity - risk.floor : null;
  const deskSize = risk ? risk.originalStake + risk.borrowed : null;
  const usedNotional = d.positions.data ? d.positions.data.reduce((acc, p) => acc + (p.lots > 0n ? notionalOf(network.perpl.markets.find((x) => x.perpId === p.perpId)!, p.lots, p.markPns) : 0n), 0n) : 0n;
  const maxSafeNotional = risk && policy ? (risk.equity * BigInt(policy.maxLeverageHdths)) / 100n - usedNotional : null;
  // Price at which this position alone would take equity to the desk floor (the enforce trigger).
  const enforcementPrice =
    risk && postEquity !== null && parsed.lots > 0n && !reduceOnly
      ? (() => {
          const buffer = postEquity - risk.floor;
          if (buffer <= 0n) return null;
          // price move (PNS) that loses `buffer` AUSD on `lots`: buffer * 10^(pd+ld) / (lots * 10^6)
          const movePns = (buffer * 10n ** BigInt(m.priceDecimals + m.lotDecimals)) / (parsed.lots * 1_000_000n);
          return side === 0 ? parsed.priceLimit - movePns : parsed.priceLimit + movePns;
        })()
      : null;

  const check =
    risk && policy && !parsed.error
      ? checkPolicy({ order, policy, risk, markPns, markValid, positionLots: pos?.lots ?? 0n, positionIsLong: pos && pos.lots > 0n ? pos.isLong : null })
      : null;
  const blocked = check ? !check.ok : false;
  const canSubmit = deployed && a.status === "ready" && Boolean(d.desk) && Boolean(risk) && !parsed.error && !blocked;
  const busy = state.kind === "requested" || state.kind === "submitted" || state.kind === "confirming";

  const submit = async () => {
    if (!a.account || !d.desk || !risk) return;
    await run(tradeAction(a.account, d.desk, risk.accountId, order, via, `${side === 0 ? "Buy" : "Sell"} ${size} ${m.symbol}`));
    d.refreshAll();
  };

  /** Direct contract call, deliberately skipping frontend validation and simulation. */
  const submitToContract = async () => {
    if (!a.account || !d.desk) return;
    await run({
      label: "Contract rejection test",
      expect: async () => ({ outcome: "contract-rejected" }),
      send: () =>
        sendWriteUnchecked(a.account!, {
          address: d.desk!,
          abi: deskAbi,
          functionName: "trade",
          args: [{ ...order }],
        }),
      observe: async () => ({ outcome: "executed" }),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Side" className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
        <button
          onClick={() => setSide(0)}
          aria-pressed={side === 0}
          className={cx("rounded-md py-2 text-sm font-semibold", side === 0 ? "bg-long text-white" : "text-fg-2 hover:text-fg")}
        >
          Long
        </button>
        <button
          onClick={() => setSide(1)}
          aria-pressed={side === 1}
          className={cx("rounded-md py-2 text-sm font-semibold", side === 1 ? "bg-short text-white" : "text-fg-2 hover:text-fg")}
        >
          Short
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div role="group" aria-label="Time in force" className="flex gap-1 rounded-md bg-surface-2 p-0.5 text-xs">
          {(["IOC", "FOK"] as const).map((t) => (
            <button key={t} onClick={() => setFok(t === "FOK")} aria-pressed={fok === (t === "FOK")} className={cx("rounded px-2.5 py-1", fok === (t === "FOK") ? "bg-surface-3 text-fg" : "text-muted")}>
              {t}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-fg-2">
          <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} className="accent-[var(--color-accent)]" />
          Reduce-only
        </label>
      </div>

      <label className="block">
        <span className="text-[11px] tracking-wide text-muted uppercase">Limit price (USD)</span>
        <input
          inputMode="decimal"
          value={priceText}
          onChange={(e) => setPriceStr(e.target.value)}
          className="num mt-1 w-full rounded-md border border-line-strong bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>
      <label className="block">
        <span className="text-[11px] tracking-wide text-muted uppercase">Size ({m.symbol})</span>
        <input
          inputMode="decimal"
          value={size}
          onChange={(e) => setSize(e.target.value)}
          className="num mt-1 w-full rounded-md border border-line-strong bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </label>
      <label className="block">
        <span className="flex justify-between text-[11px] tracking-wide text-muted uppercase">
          <span>Leverage</span>
          <span className={cx("num", lev > maxLev ? "text-breach" : "text-fg")}>{lev.toFixed(2)}x / max {maxLev.toFixed(2)}x</span>
        </span>
        <input
          type="range"
          min={1}
          max={10}
          step={0.25}
          value={lev}
          onChange={(e) => setLev(Number(e.target.value))}
          aria-valuetext={`${lev.toFixed(2)}x`}
          className="mt-2 w-full accent-[var(--color-accent)]"
        />
        <span className="mt-0.5 block text-[10px] text-muted">The slider goes past the limit on purpose, so the policy block is visible.</span>
      </label>
      {parsed.error && <p className="text-xs text-breach">{parsed.error}</p>}

      {risk && (
        <div className="rounded-lg border border-line p-3 text-xs" aria-label="Capital available to this desk">
          <div className="flex justify-between"><span className="text-muted">Your capital (stake)</span><span className="num">{ausd(risk.originalStake)}</span></div>
          <div className="flex justify-between"><span className="text-muted">+ Restricted credit</span><span className="num">{ausd(risk.borrowed)}</span></div>
          <div className="mt-1 flex justify-between border-t border-line pt-1 font-medium"><span>Maximum position ({maxLev.toFixed(0)}x of equity)</span><span className="num">{ausd((risk.equity * BigInt(policy?.maxLeverageHdths ?? 500)) / 100n)}</span></div>
        </div>
      )}

      <dl className="space-y-1 rounded-lg border border-line bg-surface-2 p-3 text-xs">
        {[
          ["Notional", `${ausd(notional)} AUSD`],
          ["Est. margin", `${ausd(margin)} AUSD`],
          ["Est. fee (Perpl taker)", feeEst === null ? "reading…" : `${ausd(feeEst, 4)} AUSD`],
          ["Cost vs mark at limit", `${ausd(crossCost, 4)} AUSD (worst case)`],
          ["Max allowed leverage", `${maxLev.toFixed(2)}x`],
          ["Max safe order", maxSafeNotional === null ? "—" : `${ausd(maxSafeNotional > 0n ? maxSafeNotional : 0n)} AUSD notional`],
          ["Restricted credit usage", risk && deskSize ? (risk.borrowed > 0n ? `${((Number(notional) / Number(deskSize)) * 100).toFixed(1)}% of ${ausd(deskSize)} desk` : "Evaluation: own stake only") : "—"],
          ["Post-trade equity", postEquity === null ? "—" : `${ausd(postEquity)} AUSD (est.)`],
          ["Distance to floor", distanceAfter === null ? "—" : `${ausd(distanceAfter)} AUSD`],
          ["Enforcement price", enforcementPrice === null ? "—" : `${formatUnitsFixed(enforcementPrice, m.priceDecimals, m.priceDecimals)} (desk floor, est.)`],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted">{k}</dt>
            <dd className="num text-right text-fg">{v}</dd>
          </div>
        ))}
      </dl>

      {/* Policy check: FRONTEND VALIDATION */}
      <section aria-label="Policy check" className={cx("rounded-lg border p-3", !check ? "border-line" : blocked ? "border-breach/50 bg-breach-bg" : "border-safe/40 bg-safe-bg")}>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap">
            {!check ? <CircleHelp size={15} aria-hidden className="text-muted" /> : blocked ? <ShieldAlert size={15} aria-hidden className="text-breach" /> : <ShieldCheck size={15} aria-hidden className="text-safe" />}
            Policy check
            <span className={cx("ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider", !check ? "bg-surface-3 text-muted" : blocked ? "bg-breach/20 text-breach" : "bg-safe/20 text-safe")}>
              {!check ? "NEEDS A DESK" : blocked ? "BLOCKED" : "PASS"}
            </span>
          </div>
          <span className="text-[10px] tracking-wide whitespace-nowrap text-muted uppercase">Frontend validation</span>
        </div>
        {check && blocked && (
          <div className="mt-2 text-xs">
            <div className="font-semibold text-breach">Order blocked by desk policy</div>
            <ul className="mt-1 space-y-0.5">
              {check.checks
                .filter((c) => c.status === "blocked")
                .map((c) => (
                  <li key={c.rule} className="flex gap-1.5 text-fg-2">
                    <Ban size={12} aria-hidden className="mt-0.5 shrink-0 text-breach" />
                    <span>
                      <span className="text-fg">{c.rule}:</span> {c.detail}
                    </span>
                  </li>
                ))}
            </ul>
            <div className="mt-1.5 text-fg-2">Nothing was sent to Perpl.</div>
          </div>
        )}
        {check && !blocked && (
          <ul className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-fg-2">
            {check.checks.map((c) => (
              <li key={c.rule} className="flex items-center gap-1">
                <CheckCircle2 size={11} aria-hidden className={c.status === "pass" ? "text-safe" : "text-muted"} />
                {c.rule}
              </li>
            ))}
          </ul>
        )}
      </section>

      {relayerUrl && (
        <div role="group" aria-label="Submission route" className="flex items-center justify-between text-xs">
          <span className="text-muted">Submit via</span>
          <div className="flex gap-1 rounded-md bg-surface-2 p-0.5">
            {(["relayer", "self"] as const).map((v) => (
              <button key={v} onClick={() => setVia(v)} aria-pressed={via === v} className={cx("rounded px-2 py-1", via === v ? "bg-surface-3 text-fg" : "text-muted")}>
                {v === "relayer" ? "Relayer (signed intent)" : "Self (pay gas)"}
              </button>
            ))}
          </div>
        </div>
      )}

      <Button variant={side === 0 ? "long" : "short"} disabled={!canSubmit || busy} onClick={() => void submit()}>
        <Send size={15} aria-hidden />
        {side === 0 ? "Buy / Long" : "Sell / Short"} {m.symbol}
      </Button>

      {!deployed && <Notice tone="warn" title="Desk contracts PENDING deployment">Orders unlock once the testnet deployment is recorded.</Notice>}
      {deployed && a.status !== "ready" && <Notice tone="info" title="Sign in to trade">A passkey account is needed to sign orders.</Notice>}

      {blocked && deployed && a.status === "ready" && d.desk && (
        <div className="rounded-lg border border-dashed border-line-strong p-3 text-xs">
          <div className="flex items-center gap-1.5 font-semibold">
            <FlaskConical size={13} aria-hidden /> Contract rejection test
          </div>
          <p className="mt-1 text-fg-2">
            Send this blocked order straight to <code className="num">Desk.trade()</code>, skipping the check above. The contract
            should reject it on its own, in a mined transaction you can inspect. You pay testnet gas.
          </p>
          <Button variant="danger" className="mt-2 w-full" disabled={busy} onClick={() => void submitToContract()}>
            Send to contract anyway
          </Button>
        </div>
      )}

      <TxStatus state={state} onReset={reset} />
    </div>
  );
}
