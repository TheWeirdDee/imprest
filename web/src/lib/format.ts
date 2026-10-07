import { formatUnitsFixed } from "@imprest/core";

export const ausd = (v: bigint | null | undefined, fraction = 2) =>
  v === null || v === undefined ? null : formatUnitsFixed(v, 6, fraction);

export const signedAusd = (v: bigint | null | undefined, fraction = 2) => {
  if (v === null || v === undefined) return null;
  const s = formatUnitsFixed(v, 6, fraction);
  return v > 0n ? `+${s}` : s;
};

export const scaled = (v: number | null | undefined, decimals: number, fraction = decimals) =>
  v === null || v === undefined ? null : formatUnitsFixed(BigInt(Math.round(v)), decimals, fraction);

export const pct = (v: number, digits = 2) => `${v >= 0 ? "" : ""}${(v * 100).toFixed(digits)}%`;

export const shortAddr = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export const shortHash = (h?: string | null) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "");

export function ago(tsSec: number, now = Date.now() / 1000): string {
  const d = Math.max(0, Math.round(now - tsSec));
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}
