/**
 * What a trade did, from the SIGNED venue position before and after it (long positive, short
 * negative, flat zero). Unsigned sizes alone are not enough: a 100-lot long that sells 200 lots ends
 * as a 100-lot short, the same unsigned size, yet 200 lots traded.
 */
export function signedLots(lots: bigint, positionType: number): bigint {
  return positionType === 0 ? lots : -lots;
}

export interface FillReport extends Record<string, string> {
  positionLots: string;
  positionSide: "flat" | "long" | "short";
  filledLots: string;
  fill: "none" | "partial" | "full";
  direction: "matches order" | "opposite to order";
}

/** side 0 = buy (can only raise the signed position), side 1 = sell (can only lower it). */
export function describeFill(order: { side: number; lots: bigint }, before: bigint, after: bigint): FillReport {
  const delta = after - before;
  const filled = delta < 0n ? -delta : delta;
  const matches = filled === 0n || (order.side === 0 ? delta > 0n : delta < 0n);
  return {
    positionLots: String(after < 0n ? -after : after),
    positionSide: after === 0n ? "flat" : after > 0n ? "long" : "short",
    filledLots: String(filled),
    fill: filled === 0n ? "none" : filled >= order.lots ? "full" : "partial",
    direction: matches ? "matches order" : "opposite to order",
  };
}
