"use client";

import { useCallback, useState } from "react";
import {
  createWalletClient,
  http,
  type Abi,
  type Address,
  type Hex,
  type LocalAccount,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { compareReadback, toAppError, transition, type ActionState, type Readback } from "@imprest/core";
import { chain, primaryClient, verifyClient } from "./chain";
import { primaryRpc, verifyRpc, network } from "./env";

export interface LocalReceipt {
  id: string;
  label: string;
  network: string;
  chainId: number;
  txHash: Hex;
  blockNumber: string;
  state: ActionState["kind"];
  reason?: string;
  readback?: Readback;
  at: string;
}

const RECEIPTS_KEY = `imprest.receipts.${network.environment}`;

export function loadLocalReceipts(): LocalReceipt[] {
  try {
    return JSON.parse(localStorage.getItem(RECEIPTS_KEY) ?? "[]") as LocalReceipt[];
  } catch {
    return [];
  }
}

function saveLocalReceipt(r: LocalReceipt) {
  try {
    const all = loadLocalReceipts().filter((x) => x.id !== r.id);
    all.unshift(r);
    localStorage.setItem(RECEIPTS_KEY, JSON.stringify(all.slice(0, 200)));
  } catch {
    /* storage unavailable: receipts still shown in-session */
  }
}

export interface WriteSpec {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
}

/** Sends a contract write with a simulated, tightly capped gas limit (Monad charges the limit). */
export async function sendWrite(account: LocalAccount, w: WriteSpec): Promise<Hex> {
  const pc = primaryClient();
  const { request } = await pc.simulateContract({ account, ...(w as any) });
  const est = await pc.estimateContractGas({ account, ...(w as any) });
  const wallet = createWalletClient({ account, chain, transport: http(primaryRpc) });
  return wallet.writeContract({ ...(request as any), gas: (est * 115n) / 100n });
}

/**
 * Contract-rejection demo: sends WITHOUT simulation, with a fixed gas limit, so an order
 * the frontend already blocked is mined and rejected by the Desk contract itself.
 */
export async function sendWriteUnchecked(account: LocalAccount, w: WriteSpec, gas = 1_500_000n): Promise<Hex> {
  const wallet = createWalletClient({ account, chain, transport: http(primaryRpc) });
  return wallet.writeContract({ ...(w as any), account, chain, gas });
}

/** Recovers the named revert of a mined failed transaction by replaying it at its block. */
export async function minedRevertReason(hash: Hex): Promise<{ name: string; message: string } | null> {
  const pc = primaryClient();
  const tx = await pc.getTransaction({ hash });
  try {
    await pc.call({ account: tx.from, to: tx.to!, data: tx.input, gas: tx.gas, blockNumber: tx.blockNumber! - 1n });
    return null;
  } catch (e) {
    const ae = toAppError(e);
    return { name: ae.contractError ?? ae.code, message: `${ae.title}. ${ae.message}` };
  }
}

export interface ActionSpec {
  label: string;
  /** Expected post-state, computed BEFORE sending from pre-state reads. Must be non-empty. */
  expect: () => Promise<Record<string, string>>;
  /** Submits and returns the tx hash (self-submitted or via the relayer). */
  send: () => Promise<Hex>;
  /** Reads the post-state from the given (independent) client at the receipt block. */
  observe: (client: PublicClient, blockNumber: bigint, receipt: TransactionReceipt) => Promise<Record<string, string>>;
}

async function waitForBlock(client: PublicClient, target: bigint, timeoutMs = 30_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if ((await client.getBlockNumber()) >= target) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("verification RPC did not reach the receipt block in time");
}

/**
 * Runs an external action through requested -> submitted -> confirming -> verified |
 * verification_failed | failed. Success is never shown from submission or a receipt alone.
 */
export function useAction() {
  const [state, setState] = useState<ActionState>({ kind: "idle" });

  const run = useCallback(async (spec: ActionSpec) => {
    let s: ActionState = transition({ kind: "idle" }, { type: "request", label: spec.label });
    const set = (n: ActionState) => {
      s = n;
      setState(n);
    };
    set(s);
    const vc = verifyClient();
    if (!vc) {
      set(transition(s, { type: "external", label: spec.label, reason: "No independent verification RPC configured for this environment." }));
      return s;
    }
    let expected: Record<string, string>;
    let hash: Hex;
    try {
      expected = await spec.expect();
      hash = await spec.send();
    } catch (e) {
      const ae = toAppError(e);
      set(transition(s, { type: "error", reason: `${ae.title}. ${ae.message}`, code: ae.code }));
      return s;
    }
    set(transition(s, { type: "submitted", txHash: hash }));
    let receipt: TransactionReceipt;
    try {
      receipt = await primaryClient().waitForTransactionReceipt({ hash, timeout: 60_000 });
    } catch (e) {
      set(transition(s, { type: "error", reason: `No receipt: ${(e as Error).message}` }));
      return s;
    }
    let revertReason: string | undefined;
    if (receipt.status === "reverted") {
      const r = await minedRevertReason(hash).catch(() => null);
      revertReason = r ? `Contract rejection in block ${receipt.blockNumber}: ${r.name}. ${r.message}` : `Reverted onchain in block ${receipt.blockNumber}`;
    }
    set(
      transition(s, {
        type: "receipt",
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        reason: revertReason,
      }),
    );
    if (receipt.status !== "success") {
      saveLocalReceipt({ id: hash, label: spec.label, network: network.label, chainId: network.chainId, txHash: hash, blockNumber: receipt.blockNumber.toString(), state: "failed", reason: revertReason, at: new Date().toISOString() });
      return s;
    }
    try {
      await waitForBlock(vc, receipt.blockNumber);
      const vReceipt = await vc.getTransactionReceipt({ hash });
      if (vReceipt.status !== "success" || vReceipt.blockNumber !== receipt.blockNumber) {
        throw new Error("independent RPC reports a different receipt");
      }
      const observed = await spec.observe(vc, receipt.blockNumber, vReceipt);
      const cmp = compareReadback(expected, observed);
      const evidence: Readback = { rpc: verifyRpc ?? "", blockNumber: receipt.blockNumber.toString(), expected, observed };
      set(transition(s, { type: "readback", ok: cmp.ok, reason: cmp.reason, evidence }));
      saveLocalReceipt({
        id: hash,
        label: spec.label,
        network: network.label,
        chainId: network.chainId,
        txHash: hash,
        blockNumber: receipt.blockNumber.toString(),
        state: cmp.ok ? "verified" : "verification_failed",
        reason: cmp.reason,
        readback: evidence,
        at: new Date().toISOString(),
      });
    } catch (e) {
      set(transition(s, { type: "error", reason: `Verification failed: ${(e as Error).message}` }));
      saveLocalReceipt({ id: hash, label: spec.label, network: network.label, chainId: network.chainId, txHash: hash, blockNumber: receipt.blockNumber.toString(), state: "verification_failed", reason: (e as Error).message, at: new Date().toISOString() });
    }
    return s;
  }, []);

  const reset = useCallback(() => setState({ kind: "idle" }), []);
  return { state, run, reset };
}
