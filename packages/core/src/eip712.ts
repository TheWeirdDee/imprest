import type { Address } from "viem";

/** Mirrors Desk.Order. side: 0 buy, 1 sell. leverage in hundredths. */
export interface OrderIntent {
  perpId: bigint;
  side: 0 | 1;
  priceLimit: bigint;
  lots: bigint;
  leverage: bigint;
  reduceOnly: boolean;
  fillOrKill: boolean;
}

export const tradeIntentTypes = {
  TradeIntent: [
    { name: "perpId", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "priceLimit", type: "uint256" },
    { name: "lots", type: "uint256" },
    { name: "leverage", type: "uint256" },
    { name: "reduceOnly", type: "bool" },
    { name: "fillOrKill", type: "bool" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/** EIP-712 domain: one per desk, so a signature can never be replayed on another desk or chain. */
export function deskDomain(chainId: number, desk: Address) {
  return { name: "Imprest Desk", version: "1", chainId, verifyingContract: desk } as const;
}

export function tradeIntentMessage(o: OrderIntent, nonce: bigint, deadline: bigint) {
  return { ...o, nonce, deadline };
}

/** JSON-safe wire format for the relayer. */
export interface SignedIntentWire {
  chainId: number;
  desk: Address;
  order: {
    perpId: string;
    side: 0 | 1;
    priceLimit: string;
    lots: string;
    leverage: string;
    reduceOnly: boolean;
    fillOrKill: boolean;
  };
  nonce: string;
  deadline: string;
  signature: `0x${string}`;
}

export function toWire(
  chainId: number,
  desk: Address,
  o: OrderIntent,
  nonce: bigint,
  deadline: bigint,
  signature: `0x${string}`,
): SignedIntentWire {
  return {
    chainId,
    desk,
    order: {
      perpId: o.perpId.toString(),
      side: o.side,
      priceLimit: o.priceLimit.toString(),
      lots: o.lots.toString(),
      leverage: o.leverage.toString(),
      reduceOnly: o.reduceOnly,
      fillOrKill: o.fillOrKill,
    },
    nonce: nonce.toString(),
    deadline: deadline.toString(),
    signature,
  };
}

function big(s: unknown, field: string): bigint {
  if (typeof s !== "string" || !/^\d+$/.test(s)) throw new Error(`${field} must be a non-negative integer string`);
  return BigInt(s);
}

/** Strict parse of an untrusted wire intent. Throws on any malformed field. */
export function fromWire(w: SignedIntentWire): { order: OrderIntent; nonce: bigint; deadline: bigint } {
  if (!w || typeof w !== "object" || !w.order) throw new Error("malformed intent");
  if (w.order.side !== 0 && w.order.side !== 1) throw new Error("side must be 0 or 1");
  if (typeof w.order.reduceOnly !== "boolean" || typeof w.order.fillOrKill !== "boolean") {
    throw new Error("reduceOnly and fillOrKill must be booleans");
  }
  if (typeof w.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(w.signature)) {
    throw new Error("signature must be 65 bytes hex");
  }
  return {
    order: {
      perpId: big(w.order.perpId, "perpId"),
      side: w.order.side,
      priceLimit: big(w.order.priceLimit, "priceLimit"),
      lots: big(w.order.lots, "lots"),
      leverage: big(w.order.leverage, "leverage"),
      reduceOnly: w.order.reduceOnly,
      fillOrKill: w.order.fillOrKill,
    },
    nonce: big(w.nonce, "nonce"),
    deadline: big(w.deadline, "deadline"),
  };
}
