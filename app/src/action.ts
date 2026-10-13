import { useCallback, useState } from "react";
import type { Hex, PublicClient, TransactionReceipt } from "viem";
import { compareReadback, toAppError, transition, type ActionState } from "@imprest/core";
import { network, primary, verify } from "./chain";

export interface ActionSpec {
  label: string;
  /** Expected post-state, computed before sending. Must be non-empty. */
  expect: () => Promise<Record<string, string>>;
  send: () => Promise<Hex>;
  /** Optional: expected values only known once the PRIMARY receipt exists, read on the primary. */
  expectAfterReceipt?: (receipt: TransactionReceipt, primary: PublicClient) => Promise<Record<string, string>>;
  observe: (client: PublicClient, block: bigint, receipt: TransactionReceipt) => Promise<Record<string, string>>;
}

/**
 * Transactions broadcast in this app session whose outcome is not known yet. Kept in memory only:
 * it survives moving between screens but not an app restart (no storage module in the native build).
 */
const unresolved = new Map<Hex, { label: string; at: number }>();
const DROPPED_AFTER_MS = 10 * 60_000;

async function stillUnresolved(): Promise<[Hex, { label: string; at: number }] | null> {
  for (const [hash, info] of unresolved) {
    const rc = await primary.getTransactionReceipt({ hash }).catch(() => null);
    if (rc) {
      unresolved.delete(hash);
      continue;
    }
    const known = await primary.getTransaction({ hash }).catch(() => null);
    if (!known && Date.now() - info.at > DROPPED_AFTER_MS) {
      unresolved.delete(hash);
      continue;
    }
    return [hash, info];
  }
  return null;
}

/**
 * Same state machine as the web app: requested -> submitted -> confirming -> verified, with
 * "unknown" when no receipt arrives in time (the transaction may still settle; it is never shown
 * as failed). "Verified" only when the independent RPC agrees at the same receipt block.
 */
export function useAction() {
  const [state, setState] = useState<ActionState>({ kind: "idle" });
  const run = useCallback(async (spec: ActionSpec) => {
    let s: ActionState = transition({ kind: "idle" }, { type: "request", label: spec.label });
    const set = (n: ActionState) => {
      s = n;
      setState(n);
    };
    const open = await stillUnresolved();
    if (open) {
      set(transition(s, { type: "error", reason: `An earlier transaction (${open[0].slice(0, 10)}…, "${open[1].label}") is not confirmed yet. Nothing was sent, so it cannot be duplicated. Try again once it settles.`, code: "PENDING_TRANSACTION" }));
      return;
    }
    set(s);
    if (!verify) {
      set(transition(s, { type: "external", label: spec.label, reason: "No independent verification RPC for this network." }));
      return;
    }
    let expected: Record<string, string>;
    let hash: Hex;
    try {
      expected = await spec.expect();
      hash = await spec.send();
    } catch (e) {
      const ae = toAppError(e);
      set(transition(s, { type: "error", reason: `${ae.title}. ${ae.message}`, code: ae.code }));
      return;
    }
    set(transition(s, { type: "submitted", txHash: hash }));
    unresolved.set(hash, { label: spec.label, at: Date.now() });
    let rc: TransactionReceipt;
    try {
      rc = await primary.waitForTransactionReceipt({ hash, timeout: 60_000 });
    } catch (e) {
      set(transition(s, { type: "receipt_unavailable", reason: `No receipt yet (${(e as Error).message.split("\n")[0]}). The transaction may still settle: do not send it again.` }));
      return;
    }
    unresolved.delete(hash);
    set(transition(s, { type: "receipt", status: rc.status, blockNumber: rc.blockNumber, reason: rc.status === "reverted" ? `Reverted in block ${rc.blockNumber}` : undefined }));
    if (rc.status !== "success") return;
    try {
      for (let i = 0; i < 60 && (await verify.getBlockNumber()) < rc.blockNumber; i++) await new Promise((r) => setTimeout(r, 500));
      const vrc = await verify.getTransactionReceipt({ hash });
      if (vrc.status !== "success" || vrc.blockNumber !== rc.blockNumber) throw new Error("the independent RPC reports a different receipt");
      if (spec.expectAfterReceipt) expected = { ...expected, ...(await spec.expectAfterReceipt(rc, primary)) };
      const observed = await spec.observe(verify, rc.blockNumber, vrc);
      const cmp = compareReadback(expected, observed);
      set(transition(s, { type: "readback", ok: cmp.ok, reason: cmp.reason, evidence: { rpc: network.rpcUrls[1]!, blockNumber: rc.blockNumber.toString(), expected, observed } }));
    } catch (e) {
      set(transition(s, { type: "error", reason: `Verification failed: ${(e as Error).message}` }));
    }
  }, []);
  return { state, run, reset: () => setState({ kind: "idle" }) };
}
