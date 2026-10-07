import { useCallback, useState } from "react";
import type { Hex, PublicClient, TransactionReceipt } from "viem";
import { compareReadback, toAppError, transition, type ActionState } from "@imprest/core";
import { network, primary, verify } from "./chain";

export interface ActionSpec {
  label: string;
  expect: () => Promise<Record<string, string>>;
  send: () => Promise<Hex>;
  observe: (client: PublicClient, block: bigint, receipt: TransactionReceipt) => Promise<Record<string, string>>;
}

/**
 * Same state machine as the web app: requested -> submitted -> confirming -> verified.
 * "Verified" only when the independent RPC agrees at the receipt block.
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
    try {
      const rc = await primary.waitForTransactionReceipt({ hash, timeout: 60_000 });
      set(transition(s, { type: "receipt", status: rc.status, blockNumber: rc.blockNumber, reason: rc.status === "reverted" ? `Reverted in block ${rc.blockNumber}` : undefined }));
      if (rc.status !== "success") return;
      for (let i = 0; i < 60 && (await verify.getBlockNumber()) < rc.blockNumber; i++) await new Promise((r) => setTimeout(r, 500));
      const vrc = await verify.getTransactionReceipt({ hash });
      const observed = await spec.observe(verify, rc.blockNumber, vrc);
      const cmp = compareReadback(expected, observed);
      set(transition(s, { type: "readback", ok: cmp.ok && vrc.status === "success", reason: cmp.reason, evidence: { rpc: network.rpcUrls[1]!, blockNumber: rc.blockNumber.toString(), expected, observed } }));
    } catch (e) {
      set(transition(s, { type: "error", reason: `Verification failed: ${(e as Error).message}` }));
    }
  }, []);
  return { state, run, reset: () => setState({ kind: "idle" }) };
}
