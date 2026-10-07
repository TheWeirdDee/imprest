import { ShieldAlert, ShieldCheck, AlertTriangle } from "lucide-react";
import { INT256_MIN, riskLevel, type RiskState } from "@imprest/core";
import { ausd } from "@/lib/format";
import { cx } from "./ui";

/**
 * Distance-to-floor meter. Scale runs from the trading floor (left) to start equity and
 * beyond. Color is paired with an icon and a sentence; numbers are exact base-unit reads.
 */
export function RiskMeter({ r, compact = false }: { r: RiskState; compact?: boolean }) {
  const level = riskLevel(r);
  const hasDaily = r.dailyFloor !== INT256_MIN;
  const floor = Number(r.floor);
  const start = Number(r.startEquity);
  const eq = Number(r.equity);
  const span = Math.max(start - floor, 1);
  // visible range: floor - 15% span .. start + 35% span
  const lo = floor - span * 0.15;
  const hi = Math.max(start + span * 0.35, eq + span * 0.05);
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%`;
  const distance = r.equity - r.floor;
  const dailyDistance = hasDaily ? r.equity - r.dailyFloor : null;
  const tightest = dailyDistance !== null && dailyDistance < distance ? dailyDistance : distance;
  const bufferLeft = Math.max(0, Math.min(1, Number(r.equity - r.floor) / span));
  const Icon = level === "breach" ? ShieldAlert : level === "warning" ? AlertTriangle : ShieldCheck;
  const tone = level === "breach" ? "text-breach" : level === "warning" ? "text-warn" : "text-safe";
  const bar = level === "breach" ? "bg-breach" : level === "warning" ? "bg-warn" : "bg-safe";

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className={cx("flex items-center gap-2 font-semibold", tone, compact ? "text-sm" : "text-base")}>
          <Icon size={compact ? 15 : 18} aria-hidden />
          {level === "breach" ? (
            <span>Below a loss limit. New orders are refused; anyone can call enforce().</span>
          ) : (
            <span>
              <span className="num">{ausd(tightest)}</span> AUSD above the nearest limit
            </span>
          )}
        </div>
        {!compact && (
          <div className="text-xs text-muted">
            <span className="num">{Math.round(bufferLeft * 100)}%</span> of the drawdown buffer left
          </div>
        )}
      </div>

      <div className="relative mt-3 h-9" aria-hidden>
        <div className="absolute inset-x-0 top-3 h-2.5 rounded-full bg-surface-3" />
        <div className="absolute top-3 h-2.5 rounded-l-full bg-breach/25" style={{ left: 0, width: pos(floor) }} />
        <div className={cx("absolute top-3 h-2.5 rounded-full opacity-90", bar)} style={{ left: pos(floor), width: `calc(${pos(Math.max(eq, floor))} - ${pos(floor)})` }} />
        <div className="absolute top-1 h-6.5 w-0.5 bg-breach" style={{ left: pos(floor) }} />
        {hasDaily && <div className="absolute top-1 h-6.5 w-0.5 bg-warn" style={{ left: pos(Number(r.dailyFloor)) }} />}
        <div className="absolute top-1 h-6.5 w-px bg-fg-2/60" style={{ left: pos(start) }} />
        <div className="absolute top-0 -ml-1.5 h-0 w-0 border-x-[6px] border-t-[7px] border-x-transparent border-t-fg" style={{ left: pos(eq) }} />
      </div>
      <div className="relative h-4 text-[10px] text-muted" aria-hidden>
        <span className="absolute -translate-x-1/2 whitespace-nowrap text-breach" style={{ left: pos(floor) }}>
          floor
        </span>
        {hasDaily && (
          <span className="absolute -translate-x-1/2 whitespace-nowrap text-warn" style={{ left: pos(Number(r.dailyFloor)) }}>
            daily
          </span>
        )}
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pos(start) }}>
          start
        </span>
      </div>

      {!compact && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-[11px] text-muted uppercase">Equity</dt>
            <dd className="num">{ausd(r.equity)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted uppercase">Trading floor</dt>
            <dd className="num text-breach">{ausd(r.floor)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted uppercase">Daily floor</dt>
            <dd className="num text-warn">{hasDaily ? ausd(r.dailyFloor) : "not set today"}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted uppercase">Start equity</dt>
            <dd className="num">{ausd(r.startEquity)}</dd>
          </div>
        </dl>
      )}
      <p className="sr-only">
        Equity {ausd(r.equity)} AUSD. Trading floor {ausd(r.floor)} AUSD.
        {hasDaily ? ` Daily floor ${ausd(r.dailyFloor)} AUSD.` : ""} Status {level}.
      </p>
    </div>
  );
}
