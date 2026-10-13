"use client";

import { decodeEventLog, parseAbi, type Address, type Hex, type LocalAccount, type PublicClient } from "viem";
import {
  accounting,
  deskAbi,
  deskDomain,
  deskFactoryAbi,
  describeFill,
  eventMatchesOrder,
  signedLots,
  erc20Abi,
  perplExchangeAbi,
  toWire,
  tradeIntentTypes,
  type CohortPolicy,
  type OrderIntent,
  type RiskState,
} from "@imprest/core";
import { primaryClient, verifyClient } from "./chain";
import { network, relayerUrl } from "./env";
import { sendWrite, type ActionSpec } from "./tx";

const AUSD = () => network.perpl.collateralToken as Address;
const FACTORY = () => network.imprest.factory as Address;
const s = (v: unknown) => String(v);

async function readAt<T>(client: PublicClient, p: Parameters<PublicClient["readContract"]>[0], blockNumber?: bigint): Promise<T> {
  return (await client.readContract({ ...(p as any), ...(blockNumber ? { blockNumber } : {}) })) as T;
}

/** Testnet only: Agora's AUSD faucet (requestFunds). */
export function faucetAction(account: LocalAccount): ActionSpec {
  const f = network.ausdFaucet!;
  return {
    label: "Get testnet AUSD",
    expect: async () => {
      const bal = await readAt<bigint>(verifyClient()!, { address: AUSD(), abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
      return { ausdBalance: s(bal + BigInt(f.dripAmount)) };
    },
    send: () => sendWrite(account, { address: f.address, abi: parseAbi(["function requestFunds(address)"]), functionName: "requestFunds", args: [account.address] }),
    observe: async (c, bn) => ({ ausdBalance: s(await readAt<bigint>(c, { address: AUSD(), abi: erc20Abi, functionName: "balanceOf", args: [account.address] }, bn)) }),
  };
}

export function approveAction(account: LocalAccount, spender: Address, amount: bigint): ActionSpec {
  return {
    label: "Approve AUSD",
    expect: async () => ({ allowance: s(amount) }),
    send: () => sendWrite(account, { address: AUSD(), abi: erc20Abi, functionName: "approve", args: [spender, amount] }),
    observe: async (c, bn) => ({ allowance: s(await readAt<bigint>(c, { address: AUSD(), abi: erc20Abi, functionName: "allowance", args: [account.address, spender] }, bn)) }),
  };
}

export function openDeskAction(account: LocalAccount, stake: bigint, cohortId: number): ActionSpec {
  let predicted: Address | null = null;
  return {
    label: "Open desk",
    expect: async () => {
      const vc = verifyClient()!;
      const desks = await readAt<readonly Address[]>(vc, { address: FACTORY(), abi: deskFactoryAbi, functionName: "getDesks", args: [account.address] });
      predicted = await readAt<Address>(vc, { address: FACTORY(), abi: deskFactoryAbi, functionName: "predictDesk", args: [account.address, BigInt(cohortId)] });
      return { deskCount: s(desks.length + 1), newDesk: predicted.toLowerCase(), deskTrader: account.address.toLowerCase(), perplBalance: s(stake) };
    },
    send: () => sendWrite(account, { address: FACTORY(), abi: deskFactoryAbi, functionName: "openDesk", args: [stake, BigInt(cohortId)] }),
    observe: async (c, bn) => {
      const desks = await readAt<readonly Address[]>(c, { address: FACTORY(), abi: deskFactoryAbi, functionName: "getDesks", args: [account.address] }, bn);
      const last = desks[desks.length - 1]!;
      const trader = await readAt<Address>(c, { address: last, abi: deskAbi, functionName: "trader" }, bn);
      const acct = await readAt<any>(c, { address: network.perpl.exchange!, abi: perplExchangeAbi as any, functionName: "getAccountByAddr", args: [last] }, bn);
      return { deskCount: s(desks.length), newDesk: last.toLowerCase(), deskTrader: trader.toLowerCase(), perplBalance: s(acct.balanceCNS) };
    },
  };
}

function tradeEventFrom(receiptLogs: readonly { address: Address; data: Hex; topics: readonly Hex[] }[], desk: Address) {
  for (const l of receiptLogs) {
    if (l.address.toLowerCase() !== desk.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: deskAbi, data: l.data, topics: l.topics as any });
      if (ev.eventName === "TradeExecuted") return ev.args as any;
    } catch {
      /* other event */
    }
  }
  return null;
}

/** Signed Perpl position at a block: long is positive, short negative, flat zero. */
async function signedPosition(c: PublicClient, perpId: bigint, accountId: bigint, blockNumber: bigint): Promise<bigint> {
  const pos = await readAt<any>(c, { address: network.perpl.exchange!, abi: perplExchangeAbi as any, functionName: "getPosition", args: [perpId, accountId] }, blockNumber);
  return signedLots(BigInt(pos[0].lotLNS), Number(pos[0].positionType));
}

/**
 * Trade, self-submitted or relayed. Verification: the PRIMARY provider's receipt and its position
 * reads (just before and at the trade block) give the fill and resulting direction; the SECOND
 * provider must read the same receipt event, the same before/after positions and so the same fill.
 */
export function tradeAction(
  account: LocalAccount,
  desk: Address,
  accountId: bigint,
  o: OrderIntent,
  via: "self" | "relayer",
  label: string,
): ActionSpec {
  // The nonce this action signed (relayed) or 0 (self-submitted trade() emits nonce 0).
  let sentNonce = 0n;
  const fillFrom = async (c: PublicClient, bn: bigint, receipt: { logs: readonly any[]; to?: Address | null }): Promise<Record<string, string>> => {
    // Bind the receipt to THIS request: sent to this desk, and its event carries exactly the
    // requested order and nonce. Two RPCs agreeing about another trade must not pass.
    if (receipt.to && receipt.to.toLowerCase() !== desk.toLowerCase()) return { tradeExecuted: "false", orderMatches: `sent to ${receipt.to}, not the desk` };
    const ev = tradeEventFrom(receipt.logs as any, desk);
    if (!ev) return { tradeExecuted: "false" };
    const orderMatches = eventMatchesOrder(ev, o, sentNonce);
    const before = await signedPosition(c, o.perpId, accountId, bn - 1n);
    const after = await signedPosition(c, o.perpId, accountId, bn);
    const abs = (v: bigint) => (v < 0n ? -v : v);
    // The event's unsigned sizes must agree with the state reads, or the block held another change.
    const consistent = abs(before) === BigInt(ev.lotsBefore) && abs(after) === BigInt(ev.lotsAfter);
    return {
      tradeExecuted: "true",
      orderMatches,
      ...describeFill(o, before, after),
      eventMatchesState: consistent ? "yes" : `event ${ev.lotsBefore}->${ev.lotsAfter}, state ${abs(before)}->${abs(after)}`,
    };
  };
  return {
    label,
    expect: async () => ({ tradeExecuted: "true", orderMatches: "yes", direction: "matches order", eventMatchesState: "yes" }),
    expectAfterReceipt: async (receipt, primary) => {
      const f = await fillFrom(primary, receipt.blockNumber, receipt);
      // Only the measured numbers are taken from the primary; the fixed expectations stay fixed.
      const { direction: _d, eventMatchesState: _e, orderMatches: _m, ...measured } = f as Record<string, string>;
      return measured;
    },
    send: async () => {
      let hash: Hex;
      if (via === "self") {
        hash = await sendWrite(account, {
          address: desk,
          abi: deskAbi,
          functionName: "trade",
          args: [{ perpId: o.perpId, side: o.side, priceLimit: o.priceLimit, lots: o.lots, leverage: o.leverage, reduceOnly: o.reduceOnly, fillOrKill: o.fillOrKill }],
        });
      } else {
        if (!relayerUrl) throw new Error("No relayer configured for this environment; self-submit instead.");
        const last = await readAt<bigint>(primaryClient(), { address: desk, abi: deskAbi, functionName: "lastNonce" });
        const nonce = last + 1n;
        sentNonce = nonce;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 120);
        const signature = await account.signTypedData!({
          domain: deskDomain(network.chainId, desk),
          types: tradeIntentTypes,
          primaryType: "TradeIntent",
          message: { ...o, nonce, deadline },
        });
        const r = await fetch(`${relayerUrl}/v1/intents`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(toWire(network.chainId, desk, o, nonce, deadline, signature)),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw Object.assign(new Error(j.error ?? `relayer ${r.status}`), { data: j.revertData });
        hash = j.txHash as Hex;
      }
      return hash;
    },
    // `receipt` here is the SECOND RPC's copy; positions are read from Perpl on that RPC.
    observe: (c, bn, receipt) => fillFrom(c, bn, receipt),
  };
}
export function graduateAction(account: LocalAccount, desk: Address, risk: RiskState, policy: CohortPolicy): ActionSpec {
  const next = risk.tier + 1;
  const mult = BigInt(policy.tiers[next]?.sizeMultiple ?? 1);
  const credit = risk.originalStake * (mult - 1n) - risk.borrowed;
  return {
    label: "Graduate desk",
    expect: async () => ({ tier: s(next), borrowed: s(risk.borrowed + (credit > 0n ? credit : 0n)) }),
    send: () => sendWrite(account, { address: desk, abi: deskAbi, functionName: "graduate" }),
    observe: async (c, bn) => ({
      tier: s(await readAt<number>(c, { address: desk, abi: deskAbi, functionName: "tier" }, bn)),
      borrowed: s(await readAt<bigint>(c, { address: desk, abi: deskAbi, functionName: "borrowed" }, bn)),
    }),
  };
}

/** Claim: expected wallet increase is computed independently from pre-state with the accounting library. */
export function claimAction(account: LocalAccount, desk: Address, risk: RiskState, policy: CohortPolicy): ActionSpec {
  const t = policy.tiers[risk.tier]!;
  const split = accounting.claimSplit(risk.equity, risk.hwm, risk.feeOutstanding, BigInt(t.traderSplitBps), BigInt(t.protocolSplitBps));
  return {
    label: "Claim realized profit",
    expect: async () => {
      const bal = await readAt<bigint>(verifyClient()!, { address: AUSD(), abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
      return { traderBalance: s(bal + split.traderShare), feeOutstanding: s(risk.feeOutstanding - split.feesPaid) };
    },
    send: () => sendWrite(account, { address: desk, abi: deskAbi, functionName: "claim" }),
    observe: async (c, bn) => ({
      traderBalance: s(await readAt<bigint>(c, { address: AUSD(), abi: erc20Abi, functionName: "balanceOf", args: [account.address] }, bn)),
      feeOutstanding: s(await readAt<bigint>(c, { address: desk, abi: deskAbi, functionName: "feeOutstanding" }, bn)),
    }),
  };
}

export function closeAction(account: LocalAccount, desk: Address, risk: RiskState, policy: CohortPolicy): ActionSpec {
  const t = policy.tiers[risk.tier]!;
  const split = accounting.claimSplit(risk.equity, risk.hwm, risk.feeOutstanding, BigInt(t.traderSplitBps), BigInt(t.protocolSplitBps));
  const eqAfterClaim = risk.equity - split.gross;
  const w = accounting.waterfall(eqAfterClaim, risk.borrowed, risk.feeOutstanding - split.feesPaid, 0n);
  return {
    label: "Close desk",
    expect: async () => {
      const bal = await readAt<bigint>(verifyClient()!, { address: AUSD(), abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
      return { status: "2", traderBalance: s(bal + split.traderShare + w.traderRemainder) };
    },
    send: () => sendWrite(account, { address: desk, abi: deskAbi, functionName: "close" }),
    observe: async (c, bn) => ({
      status: s(await readAt<number>(c, { address: desk, abi: deskAbi, functionName: "status" }, bn)),
      traderBalance: s(await readAt<bigint>(c, { address: AUSD(), abi: erc20Abi, functionName: "balanceOf", args: [account.address] }, bn)),
    }),
  };
}

export function enforceAction(account: LocalAccount, desk: Address): ActionSpec {
  return {
    label: "Enforce desk",
    expect: async () => ({ enforcing: "true" }),
    send: () => sendWrite(account, { address: desk, abi: deskAbi, functionName: "enforce" }),
    observe: async (c, bn) => ({ enforcing: String(Number(await readAt<number>(c, { address: desk, abi: deskAbi, functionName: "status" }, bn)) >= 1) }),
  };
}
