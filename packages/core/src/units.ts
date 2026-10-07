import type { MarketConfig } from "./networks";

export const AUSD_DECIMALS = 6;
const TEN = 10n;

export function pow10(n: number): bigint {
  return TEN ** BigInt(n);
}

/** Base units -> decimal string with fixed fraction digits, no float rounding. */
export function formatUnitsFixed(value: bigint, decimals: number, fraction = 2): string {
  const neg = value < 0n;
  let v = neg ? -value : value;
  // round half up at the requested precision
  if (fraction < decimals) {
    const drop = pow10(decimals - fraction);
    v = (v + drop / 2n) / drop;
    decimals = fraction;
  }
  const s = v.toString().padStart(decimals + 1, "0");
  const int = s.slice(0, s.length - decimals);
  let frac = decimals > 0 ? s.slice(s.length - decimals) : "";
  frac = frac.padEnd(fraction, "0").slice(0, fraction);
  const intGrouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${intGrouped}${fraction > 0 ? "." + frac : ""}`;
}

export function formatAusd(value: bigint, fraction = 2): string {
  return formatUnitsFixed(value, AUSD_DECIMALS, fraction);
}

/** Decimal string -> base units. Rejects anything that is not a plain decimal. */
export function parseUnitsStrict(input: string, decimals: number): bigint {
  const s = input.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`not a decimal number: ${input}`);
  const [i, f = ""] = s.split(".");
  if (f.length > decimals) throw new Error(`too many decimals (max ${decimals})`);
  return BigInt(i!) * pow10(decimals) + BigInt(f.padEnd(decimals, "0") || "0");
}

export function priceToPns(price: string, m: MarketConfig): bigint {
  return parseUnitsStrict(price, m.priceDecimals);
}

export function pnsToPrice(pns: bigint, m: MarketConfig, fraction = m.priceDecimals): string {
  return formatUnitsFixed(pns, m.priceDecimals, fraction);
}

export function sizeToLns(size: string, m: MarketConfig): bigint {
  return parseUnitsStrict(size, m.lotDecimals);
}

export function lnsToSize(lns: bigint, m: MarketConfig): string {
  return formatUnitsFixed(lns, m.lotDecimals, m.lotDecimals);
}

/** AUSD notional (base units) of `lots` at `pricePns` — identical to Desk._notional. */
export function notional(m: MarketConfig, lots: bigint, pricePns: bigint): bigint {
  const dec = m.priceDecimals + m.lotDecimals;
  if (dec >= AUSD_DECIMALS) return (lots * pricePns) / pow10(dec - AUSD_DECIMALS);
  return lots * pricePns * pow10(AUSD_DECIMALS - dec);
}

export const BPS = 10_000n;

export function bpsOf(value: bigint, bps: bigint): bigint {
  return (value * bps) / BPS;
}

export function leverageHdthsToString(h: bigint | number): string {
  return `${(Number(h) / 100).toFixed(2)}x`;
}
