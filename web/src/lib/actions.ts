"use client";

import { decodeEventLog, parseAbi, type Address, type Hex, type LocalAccount, type PublicClient } from "viem";
import {
  accounting,
  deskAbi,
  deskDomain,
  deskFactoryAbi,
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

/**
 * Trade, self-submitted or relayed. Verification: the fill reported by the primary RPC's
 * receipt must equal the Perpl position read independently on the second RPC.
 */
export function tradeAction(
  account: LocalAccount,
  desk: Address,
  accountId: bigint,
  o: OrderIntent,
  via: "self" | "relayer",
  label: string,
): ActionSpec {
  let primaryLotsAfter: string | null = null;
  return {
    label,
    expect: async () => ({ tradeExecuted: "true", positionLots: "from-primary-receipt" }),
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
      const rc = await primaryClient().waitForTransactionReceipt({ hash, timeout: 60_000 });
      const ev = tradeEventFrom(rc.logs as any, desk);
      primaryLotsAfter = ev ? s(ev.lotsAfter) : null;
      return hash;
    },
    observe: async (c, bn, receipt) => {
      const ev = tradeEventFrom(receipt.logs as any, desk);
      const pos = await readAt<any>(c, { address: network.perpl.exchange!, abi: perplExchangeAbi as any, functionName: "getPosition", args: [o.perpId, accountId] }, bn);
      const lotsOnVerifyRpc = s(pos[0].lotLNS);
      return {
        tradeExecuted: ev ? "true" : "false",
        // equal only when the primary receipt's reported fill matches independent venue state
        positionLots: primaryLotsAfter !== null && primaryLotsAfter === lotsOnVerifyRpc ? "from-primary-receipt" : `primary ${primaryLotsAfter} vs verify ${lotsOnVerifyRpc}`,
      };
    },
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
