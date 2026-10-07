import type { OrderIntent } from "./eip712";
import type { CohortPolicy, RiskState } from "./desk";
import { INT256_MIN } from "./desk";

export interface PolicyCheck {
  rule: string;
  status: "pass" | "blocked" | "unknown";
  detail: string;
}

export interface PolicyInput {
  order: OrderIntent;
  policy: CohortPolicy;
  risk: RiskState;
  markPns: bigint | null;
  markValid: boolean;
  positionLots: bigint;
  positionIsLong: boolean | null;
}

/**
 * FRONTEND VALIDATION ONLY. Mirrors the desk's rules so a trader sees why an order would
 * fail before signing. It authorizes nothing: the Desk contract re-checks every rule and
 * reverts on its own (see /proof, "Contract rejection"). A PASS here is never a fill.
 */
export function checkPolicy(i: PolicyInput): { ok: boolean; checks: PolicyCheck[] } {
  const c: PolicyCheck[] = [];
  const { order: o, policy: p, risk: r } = i;
  const push = (rule: string, ok: boolean | null, detail: string) =>
    c.push({ rule, status: ok === null ? "unknown" : ok ? "pass" : "blocked", detail });

  push("Desk active", r.status === 0, r.status === 0 ? "Desk accepts orders" : "Desk is enforcing or closed");
  const allowed = p.markets.some((m) => m.perpId === o.perpId);
  push("Allowlisted market", allowed, allowed ? "Market is on the desk allowlist" : "Market is not allowed");
  push("Order size", o.lots > 0n, o.lots > 0n ? "Size above zero" : "Size must be above zero");
  const levOk = o.leverage > 0n && o.leverage <= BigInt(p.maxLeverageHdths);
  push(
    "Leverage",
    levOk,
    `Requested ${(Number(o.leverage) / 100).toFixed(2)}x, maximum ${(p.maxLeverageHdths / 100).toFixed(2)}x`,
  );
  push("Order type", true, o.fillOrKill ? "Fill-or-kill" : "Immediate-or-cancel (no resting orders)");
  if (i.markPns === null || i.markPns === 0n) {
    push("Price band", null, "Mark price unavailable");
  } else {
    const dist = o.priceLimit > i.markPns ? o.priceLimit - i.markPns : i.markPns - o.priceLimit;
    const ok = dist * 10_000n <= i.markPns * BigInt(p.priceBandBps);
    const bps = Number((dist * 1_000_000n) / i.markPns) / 100;
    push("Price band", ok, `${bps.toFixed(2)} bps from mark, limit ${p.priceBandBps} bps`);
  }
  if (!o.reduceOnly) {
    push("Mark validity", i.markValid, i.markValid ? "Mark is fresh" : "Mark stale: only reduce-only orders run");
    const feeOk = r.feeCap === 0n || r.feeOutstanding < r.feeCap;
    push("Credit-fee cap", feeOk, feeOk ? "Below the unpaid-fee cap" : "Unpaid fees at cap: reduce, claim or close");
  } else {
    const matches =
      i.positionLots > 0n && i.positionIsLong !== null && (o.side === 0 ? !i.positionIsLong : i.positionIsLong);
    push(
      "Reduce-only",
      matches && o.lots <= i.positionLots,
      matches ? `Closes up to ${i.positionLots} lots` : "No opposite position to reduce",
    );
  }
  const aboveFloor = r.equity >= r.floor;
  const aboveDaily = r.dailyFloor === INT256_MIN || r.equity >= r.dailyFloor;
  push("Equity floor", aboveFloor, aboveFloor ? "Equity above floor" : "Equity below floor: only enforcement runs");
  push("Daily loss", aboveDaily, aboveDaily ? "Inside today's loss limit" : "Daily loss limit reached");
  return { ok: c.every((x) => x.status !== "blocked"), checks: c };
}
