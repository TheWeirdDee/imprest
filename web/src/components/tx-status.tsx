"use client";

import { CheckCircle2, CircleDashed, Loader2, Radio, ShieldQuestion, XCircle, PlugZap, Ban } from "lucide-react";
import { STATE_LABEL, type ActionState } from "@imprest/core";
import { TxLink, cx } from "./ui";

const STEPS = ["requested", "submitted", "confirming", "verified"] as const;

/** Visible requested -> submitted -> confirming -> verified track. Never optimistic. */
export function TxStatus({ state, onReset }: { state: ActionState; onReset?: () => void }) {
  if (state.kind === "idle") return null;
  const failed = state.kind === "failed" || state.kind === "verification_failed";
  const blocked = state.kind === "unsupported_environment" || state.kind === "pending_external_dependency";
  const idx = STEPS.indexOf(state.kind as (typeof STEPS)[number]);
  const icon =
    state.kind === "verified" ? (
      <CheckCircle2 size={16} className="text-safe" aria-hidden />
    ) : failed ? (
      <XCircle size={16} className="text-breach" aria-hidden />
    ) : state.kind === "unsupported_environment" ? (
      <Ban size={16} className="text-warn" aria-hidden />
    ) : state.kind === "pending_external_dependency" ? (
      <PlugZap size={16} className="text-warn" aria-hidden />
    ) : (
      <Loader2 size={16} className="animate-spin text-accent" aria-hidden />
    );
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        "rounded-lg border p-3 text-sm",
        state.kind === "verified" ? "border-safe/40 bg-safe-bg" : failed ? "border-breach/50 bg-breach-bg" : blocked ? "border-warn/40 bg-warn-bg" : "border-line bg-surface-2",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold">
          {icon}
          <span>{"label" in state ? state.label : ""}</span>
          <span className="font-normal text-fg-2">· {STATE_LABEL[state.kind]}</span>
        </div>
        {onReset && (state.kind === "verified" || failed || blocked) && (
          <button onClick={onReset} className="text-xs text-muted hover:text-fg">
            Dismiss
          </button>
        )}
      </div>
      {!blocked && (
        <ol className="mt-2.5 grid grid-cols-4 gap-1" aria-label="Transaction progress">
          {STEPS.map((s, i) => {
            const done = idx >= i || state.kind === "verified";
            const bad = failed && i === Math.max(idx, state.kind === "verification_failed" ? 3 : 1);
            return (
              <li key={s} className="flex flex-col gap-1">
                <span className={cx("h-1 rounded-full", bad ? "bg-breach" : done ? "bg-accent" : "bg-surface-3")} />
                <span className={cx("flex items-center gap-1 text-[10px] tracking-wide uppercase", done ? "text-fg-2" : "text-muted")}>
                  {s === "requested" ? <CircleDashed size={10} aria-hidden /> : s === "submitted" ? <Radio size={10} aria-hidden /> : s === "confirming" ? <ShieldQuestion size={10} aria-hidden /> : <CheckCircle2 size={10} aria-hidden />}
                  {s === "confirming" ? "verifying" : s}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {"txHash" in state && state.txHash && (
        <div className="mt-2 text-xs text-muted">
          Transaction <TxLink hash={state.txHash} />
        </div>
      )}
      {(state.kind === "failed" || state.kind === "verification_failed" || blocked) && (
        <div className="mt-1.5 text-xs text-fg-2">{state.reason}</div>
      )}
      {state.kind === "verified" && (
        <details className="mt-1.5 text-xs text-muted">
          <summary className="cursor-pointer">Independent readback</summary>
          <div className="num mt-1 break-all">
            RPC {state.evidence.rpc} at block {state.evidence.blockNumber}
            {Object.entries(state.evidence.observed).map(([k, v]) => (
              <div key={k}>
                {k}: {v} (expected {state.evidence.expected[k]})
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
