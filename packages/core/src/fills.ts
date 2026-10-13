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

/** Perpl order type the Desk contract derives from an order (see Desk._trade). */
export function expectedOrderType(order: { side: number; reduceOnly: boolean }): number {
  return order.reduceOnly ? (order.side === 0 ? 3 : 2) : order.side === 0 ? 0 : 1;
}

/**
 * Binds a TradeExecuted event to the order that was actually requested. Two RPCs can agree about
 * the wrong transaction (for example a relayer returning the hash of an older trade on the same
 * desk), so every field of the request, the desk and the nonce must match. Returns "yes" or the
 * first mismatch.
 */
export function eventMatchesOrder(
  ev: { perpId: bigint; side: number | bigint; orderType: number | bigint; priceLimit: bigint; lots: bigint; leverage: bigint; fillOrKill: boolean; nonce: bigint },
  order: { perpId: bigint; side: number; priceLimit: bigint; lots: bigint; leverage: bigint; reduceOnly: boolean; fillOrKill: boolean },
  nonce: bigint,
): string {
  const checks: [string, unknown, unknown][] = [
    ["perpId", BigInt(ev.perpId), order.perpId],
    ["side", Number(ev.side), order.side],
    ["orderType", Number(ev.orderType), expectedOrderType(order)],
    ["priceLimit", BigInt(ev.priceLimit), order.priceLimit],
    ["lots", BigInt(ev.lots), order.lots],
    ["leverage", BigInt(ev.leverage), order.leverage],
    ["fillOrKill", Boolean(ev.fillOrKill), order.fillOrKill],
    ["nonce", BigInt(ev.nonce), nonce],
  ];
  for (const [k, got, want] of checks) if (got !== want) return `${k}: event ${String(got)}, requested ${String(want)}`;
  return "yes";
}
