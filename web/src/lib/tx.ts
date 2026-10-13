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
import { chain, primaryClient, strictPrimaryClient, verifyClient } from "./chain";
import { primaryRpc, verifyRpc, network } from "./env";

export interface LocalReceipt {
  id: string;
  label: string;
  network: string;
  chainId: number;
  txHash: Hex;
  blockNumber: string;
  /** "mined": receipt found later (after a reload) and matched on both RPCs; post-state not re-checked. */
  state: ActionState["kind"] | "mined";
  reason?: string;
  /** Not seen by the RPC for 10 minutes: no longer blocks new transactions. */
  dropped?: boolean;
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

const UNRESOLVED: LocalReceipt["state"][] = ["submitted", "unknown"];
/** After this long without the RPC knowing the transaction at all, it is treated as dropped. */
const DROPPED_AFTER_MS = 10 * 60_000;

/**
 * Looks up every saved transaction whose outcome is still unknown (for example after a receipt
 * timeout or a page reload) and records what the chain now says. Returns those still unresolved.
 * A transaction found later is "mined" (receipt matched on both RPCs), not "verified": the expected
 * post-state from the original page is not available any more, so it is not re-checked.
 */
export async function reconcilePending(): Promise<LocalReceipt[]> {
  const open = loadLocalReceipts().filter((r) => r.chainId === network.chainId && UNRESOLVED.includes(r.state));
  const still: LocalReceipt[] = [];
  for (const r of open) {
    const hash = r.txHash;
    const receipt = await primaryClient().getTransactionReceipt({ hash }).catch(() => null);
    if (receipt) {
      if (receipt.status === "reverted") {
        saveLocalReceipt({ ...r, state: "failed", blockNumber: receipt.blockNumber.toString(), reason: `Reverted onchain in block ${receipt.blockNumber} (found after the page lost track of it).` });
        continue;
      }
      const vr = await verifyClient()?.getTransactionReceipt({ hash }).catch(() => null);
      const agree = vr && vr.status === "success" && vr.blockNumber === receipt.blockNumber;
      saveLocalReceipt({
        ...r,
        state: agree ? "mined" : "unknown",
        blockNumber: receipt.blockNumber.toString(),
        reason: agree
          ? `Mined in block ${receipt.blockNumber}; the receipt matches on both RPCs. Found after the page lost track of it, so the expected result was not re-checked: look at your desk and positions.`
          : `Mined in block ${receipt.blockNumber} on the primary RPC; the second RPC has not confirmed it yet.`,
      });
      if (!agree) still.push(r);
      continue;
    }
    const known = await primaryClient().getTransaction({ hash }).catch(() => null);
    const age = Date.now() - new Date(r.at).getTime();
    if (!known && age > DROPPED_AFTER_MS) {
      saveLocalReceipt({ ...r, state: "unknown", reason: "The RPC has not seen this transaction for over 10 minutes; it was most likely dropped and did not execute. Check the explorer link before relying on that." , dropped: true });
      continue;
    }
    if (!r.dropped) still.push(r);
  }
  return still;
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
  /**
   * Optional: expected values that are only known once the PRIMARY receipt exists (for example the
   * position size the venue reported after a fill), read on the PRIMARY provider. Merged over `expect()` before the comparison, so
   * the readback shows real numbers instead of placeholders.
   */
  expectAfterReceipt?: (receipt: TransactionReceipt, primary: PublicClient) => Promise<Record<string, string>>;
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

  /** Accepts a spec, or a factory (e.g. one that first asks for the passkey); a failure in the factory becomes the error state. */
  const run = useCallback(async (input: ActionSpec | (() => Promise<ActionSpec>)) => {
    // Never send while an earlier transaction from this browser may still settle: a retry could
    // duplicate an order or open a second desk.
    const unresolved = await reconcilePending().catch(() => [] as LocalReceipt[]);
    if (unresolved.length > 0) {
      const h = unresolved[0]!.txHash;
      const st = transition(transition({ kind: "idle" }, { type: "request", label: "New transaction" }), {
        type: "error",
        reason: `An earlier transaction (${h.slice(0, 10)}…${h.slice(-6)}, "${unresolved[0]!.label}") has not been confirmed yet. Nothing was sent, so it cannot be duplicated. Check it in My receipts and try again once it settles.`,
        code: "PENDING_TRANSACTION",
      });
      setState(st);
      return st;
    }
    let spec: ActionSpec;
    try {
      spec = typeof input === "function" ? await input() : input;
    } catch (e) {
      const ae = toAppError(e);
      const code = (e as { code?: string })?.code;
      const st = transition(transition({ kind: "idle" }, { type: "request", label: "Passkey" }), {
        type: "error",
        reason: code === "PASSKEY_OPERATION_FAILED" ? "The passkey prompt was cancelled. Nothing was sent." : `${ae.title}. ${ae.message}`,
        code: code ?? ae.code,
      });
      setState(st);
      return st;
    }
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
    // Recorded before waiting, so a reload or a lost connection cannot lose the hash.
    const base = { id: hash, label: spec.label, network: network.label, chainId: network.chainId, txHash: hash, at: new Date().toISOString() };
    saveLocalReceipt({ ...base, blockNumber: "", state: "submitted" });
    // The primary provider only (no fallback), so the second RPC below stays independent.
    const pc = strictPrimaryClient();
    let receipt: TransactionReceipt;
    try {
      receipt = await pc.waitForTransactionReceipt({ hash, timeout: 60_000 });
    } catch (e) {
      const reason = `No receipt yet (${(e as Error).message.split("\n")[0]}). The transaction may still settle: do not send it again. My receipts checks it again automatically.`;
      set(transition(s, { type: "receipt_unavailable", reason }));
      saveLocalReceipt({ ...base, blockNumber: "", state: "unknown", reason });
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
      if (spec.expectAfterReceipt) expected = { ...expected, ...(await spec.expectAfterReceipt(receipt, pc)) };
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
