/**
 * External-action state machine (PRD: requested -> executed -> verified, never optimistic).
 *
 *   idle -> requested -> submitted -> confirming -> verified
 *                     \-> failed     \-> failed  \-> verification_failed
 *   submitted -> unknown (no receipt yet: the transaction may still settle) -> confirming | failed
 *   unsupported_environment | pending_external_dependency are display-only terminal states.
 *
 * "failed" after submission is reserved for a known revert. A receipt lookup that times out or
 * errors is "unknown": the hash is kept and the lookup is resumed, never treated as a failure.
 *
 * "verified" is reachable ONLY from "confirming" through a readback from an independent RPC
 * that agrees with the expected post-state. A receipt alone is "confirming", never success.
 */
export type TxHash = `0x${string}`;

export type ActionState =
  | { kind: "idle" }
  | { kind: "requested"; label: string }
  | { kind: "submitted"; label: string; txHash: TxHash }
  | { kind: "confirming"; label: string; txHash: TxHash; blockNumber: bigint }
  | { kind: "verified"; label: string; txHash: TxHash; blockNumber: bigint; evidence: Readback }
  | { kind: "unknown"; label: string; txHash: TxHash; reason: string }
  | { kind: "failed"; label: string; txHash?: TxHash; reason: string; code?: string }
  | { kind: "verification_failed"; label: string; txHash: TxHash; reason: string; evidence?: Readback }
  | { kind: "unsupported_environment"; label: string; reason: string }
  | { kind: "pending_external_dependency"; label: string; reason: string };

export interface Readback {
  rpc: string;
  blockNumber: string;
  observed: Record<string, string>;
  expected: Record<string, string>;
}

export type ActionEvent =
  | { type: "request"; label: string }
  | { type: "submitted"; txHash: TxHash }
  | { type: "receipt"; status: "success" | "reverted"; blockNumber: bigint; reason?: string }
  | { type: "readback"; ok: boolean; evidence: Readback; reason?: string }
  | { type: "error"; reason: string; code?: string }
  | { type: "receipt_unavailable"; reason: string }
  | { type: "unsupported"; label: string; reason: string }
  | { type: "external"; label: string; reason: string }
  | { type: "reset" };

export function transition(s: ActionState, e: ActionEvent): ActionState {
  if (e.type === "reset") return { kind: "idle" };
  if (e.type === "request") return { kind: "requested", label: e.label };
  if (e.type === "unsupported") return { kind: "unsupported_environment", label: e.label, reason: e.reason };
  if (e.type === "external") return { kind: "pending_external_dependency", label: e.label, reason: e.reason };
  const label = "label" in s ? s.label : "";
  switch (s.kind) {
    case "requested":
      if (e.type === "submitted") return { kind: "submitted", label, txHash: e.txHash };
      if (e.type === "error") return { kind: "failed", label, reason: e.reason, code: e.code };
      return s;
    case "submitted":
      if (e.type === "receipt") {
        return e.status === "success"
          ? { kind: "confirming", label, txHash: s.txHash, blockNumber: e.blockNumber }
          : { kind: "failed", label, txHash: s.txHash, reason: e.reason ?? "Transaction reverted" };
      }
      // Broadcast already happened: a lookup problem is not an execution failure.
      if (e.type === "receipt_unavailable" || e.type === "error") return { kind: "unknown", label, txHash: s.txHash, reason: e.reason };
      return s;
    case "unknown":
      if (e.type === "receipt") {
        return e.status === "success"
          ? { kind: "confirming", label, txHash: s.txHash, blockNumber: e.blockNumber }
          : { kind: "failed", label, txHash: s.txHash, reason: e.reason ?? "Transaction reverted" };
      }
      if (e.type === "receipt_unavailable" || e.type === "error") return { ...s, reason: e.reason };
      return s;
    case "confirming":
      if (e.type === "readback") {
        return e.ok
          ? { kind: "verified", label, txHash: s.txHash, blockNumber: s.blockNumber, evidence: e.evidence }
          : {
              kind: "verification_failed",
              label,
              txHash: s.txHash,
              reason: e.reason ?? "Independent readback disagreed",
              evidence: e.evidence,
            };
      }
      if (e.type === "error") return { kind: "verification_failed", label, txHash: s.txHash, reason: e.reason };
      return s;
    default:
      return s;
  }
}

/**
 * Compares an independent post-state readback with expected values. Any missing or
 * different field is a failure: disagreement never becomes success.
 */
export function compareReadback(
  expected: Record<string, string>,
  observed: Record<string, string>,
): { ok: boolean; reason?: string } {
  const keys = Object.keys(expected);
  if (keys.length === 0) return { ok: false, reason: "no expected post-state was declared" };
  for (const k of keys) {
    if (!(k in observed)) return { ok: false, reason: `readback missing ${k}` };
    if (observed[k] !== expected[k]) {
      return { ok: false, reason: `${k}: expected ${expected[k]}, independent RPC read ${observed[k]}` };
    }
  }
  return { ok: true };
}

export const STATE_LABEL: Record<ActionState["kind"], string> = {
  idle: "Ready",
  requested: "Waiting for signature",
  submitted: "Transaction submitted",
  confirming: "Verifying on an independent RPC",
  unknown: "Submitted, outcome not yet known",
  verified: "Verified",
  failed: "Failed",
  verification_failed: "Verification failed",
  unsupported_environment: "Not available in this environment",
  pending_external_dependency: "Waiting on an external dependency",
};
