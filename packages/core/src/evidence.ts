/**
 * Evidence standard (docs/EVIDENCE_STANDARD.md). Pure validation rules shared by
 * scripts/validate-evidence and the web /proof page. A claim's status is its strongest
 * honest label; nothing is ever upgraded by display code.
 */
export const CLAIM_STATUSES = [
  "PENDING",
  "TARGET",
  "SIMULATED",
  "LOCAL_REPRODUCTION",
  "TESTNET_VERIFIED",
  "MAINNET_VERIFIED",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export interface Claim {
  claim_id: string;
  statement: string;
  value: string | number | boolean | null;
  unit: string | null;
  network: string;
  chain_id: number | null;
  contract: string | null;
  source: string;
  evidence: string[];
  transaction_hash: string | null;
  block_number: number | null;
  timestamp_utc: string;
  status: ClaimStatus;
  methodology: string;
  sample_size: number | null;
  denominator: string | null;
  /** For claims whose proof is a rejected transaction. Defaults to "success". */
  expected_tx_status?: "success" | "reverted";
}

export interface Receipt {
  id: string;
  environment: string;
  network: string;
  chain_id?: number | null;
  timestamp_utc: string;
  git_commit: string | null;
  operation: string;
  status: string;
  tx_hash: string | null;
  block_number: number | null;
  contract: string | null;
  explorer_url: string | null;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  verification: Record<string, unknown>;
  notes: string;
}

export interface Finding {
  file: string;
  id: string;
  rule: string;
  message: string;
}

const TX = /^0x[0-9a-fA-F]{64}$/;
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export const TESTNET_CHAIN_ID = 10143;
export const MAINNET_CHAIN_ID = 143;

/**
 * @param fileExists checks an evidence path relative to the repo root
 */
export function validateClaim(c: Claim, file: string, fileExists: (p: string) => boolean): Finding[] {
  const f: Finding[] = [];
  const add = (rule: string, message: string) => f.push({ file, id: c?.claim_id ?? "?", rule, message });
  if (!c || typeof c !== "object") return [{ file, id: "?", rule: "shape", message: "claim is not an object" }];
  for (const k of ["claim_id", "statement", "network", "source", "methodology", "timestamp_utc"] as const) {
    if (typeof c[k] !== "string" || (c[k] as string).trim() === "") add("required", `${k} is missing`);
  }
  if (!CLAIM_STATUSES.includes(c.status)) add("status", `unknown status ${String(c.status)}`);
  if (c.timestamp_utc && !ISO.test(c.timestamp_utc)) add("timestamp", "timestamp_utc must be ISO-8601 UTC");
  if (c.transaction_hash !== null && !TX.test(String(c.transaction_hash))) add("tx", "transaction_hash is malformed");
  if (c.contract !== null && !ADDR.test(String(c.contract))) add("address", "contract address is malformed");
  if (!Array.isArray(c.evidence)) add("evidence", "evidence must be an array of repo paths");

  const verified = c.status === "TESTNET_VERIFIED" || c.status === "MAINNET_VERIFIED";
  const measured = verified || c.status === "LOCAL_REPRODUCTION" || c.status === "SIMULATED";

  if (c.status === "PENDING" && c.value !== null) add("pending", "a PENDING claim must have value null");
  if (measured && c.value === null) add("value", `${c.status} claim has no value`);
  if (measured && (!Array.isArray(c.evidence) || c.evidence.length === 0)) {
    add("provenance", `${c.status} claim has no evidence file`);
  }
  if (Array.isArray(c.evidence)) {
    for (const p of c.evidence) {
      if (!fileExists(p)) add("evidence-missing", `evidence file not found: ${p}`);
    }
  }
  if (c.status === "TARGET" && c.transaction_hash) add("target", "a TARGET must not carry a transaction hash");
  if (c.status === "MAINNET_VERIFIED") {
    if (c.chain_id !== MAINNET_CHAIN_ID) add("mainnet", "MAINNET_VERIFIED requires chain_id 143");
    if (!Array.isArray(c.evidence) || !c.evidence.some((p) => p.startsWith("proof/receipts/mainnet/"))) {
      add("mainnet", "MAINNET_VERIFIED must cite proof/receipts/mainnet evidence");
    }
  }
  if (c.status === "TESTNET_VERIFIED") {
    if (c.chain_id !== TESTNET_CHAIN_ID) add("testnet", "TESTNET_VERIFIED requires chain_id 10143");
    if (!Array.isArray(c.evidence) || !c.evidence.some((p) => p.startsWith("proof/receipts/"))) {
      add("testnet", "TESTNET_VERIFIED must cite a proof/receipts file");
    }
  }
  if (verified && !c.transaction_hash && !/read-only|eth_call|view call/i.test(c.methodology)) {
    add("tx-required", "a verified chain claim needs a transaction hash unless its methodology is a read-only call");
  }
  if (c.status === "LOCAL_REPRODUCTION" && c.chain_id !== null && c.chain_id !== 31337) {
    add("local", "LOCAL_REPRODUCTION cannot claim a public chain id");
  }
  if (c.sample_size !== null && (typeof c.sample_size !== "number" || c.sample_size < 1)) {
    add("sample", "sample_size must be a positive number or null");
  }
  return f;
}

export function validateReceipt(r: Receipt, file: string): Finding[] {
  const f: Finding[] = [];
  const add = (rule: string, message: string) => f.push({ file, id: r?.id ?? "?", rule, message });
  if (!r || typeof r !== "object") return [{ file, id: "?", rule: "shape", message: "receipt is not an object" }];
  for (const k of ["id", "environment", "network", "operation", "status", "timestamp_utc"] as const) {
    if (typeof r[k] !== "string" || r[k] === "") add("required", `${k} is missing`);
  }
  if (r.timestamp_utc && !ISO.test(r.timestamp_utc)) add("timestamp", "timestamp_utc must be ISO-8601 UTC");
  if (r.tx_hash !== null && r.tx_hash !== undefined && !TX.test(r.tx_hash)) add("tx", "tx_hash is malformed");
  if (r.contract && !ADDR.test(r.contract)) add("address", "contract is malformed");
  const verified = /VERIFIED/.test(r.status);
  if (verified && (!r.verification || Object.keys(r.verification).length === 0)) {
    add("verification", "a VERIFIED receipt must include its verification readback");
  }
  if (file.includes("/mainnet/") && r.environment !== "mainnet") add("network", "mainnet folder holds a non-mainnet receipt");
  if (file.includes("/testnet/") && r.environment !== "testnet") add("network", "testnet folder holds a non-testnet receipt");
  if (r.environment === "mainnet" && r.chain_id !== undefined && r.chain_id !== MAINNET_CHAIN_ID) {
    add("network", "mainnet receipt with a non-mainnet chain id");
  }
  return f;
}

/** Same claim_id in two places must agree on value and status. */
export function crossCheck(claims: { file: string; claim: Claim }[]): Finding[] {
  const seen = new Map<string, { file: string; claim: Claim }>();
  const f: Finding[] = [];
  for (const x of claims) {
    const prev = seen.get(x.claim.claim_id);
    if (prev) {
      if (JSON.stringify(prev.claim.value) !== JSON.stringify(x.claim.value) || prev.claim.status !== x.claim.status) {
        f.push({
          file: x.file,
          id: x.claim.claim_id,
          rule: "duplicate",
          message: `disagrees with ${prev.file} (${String(prev.claim.value)} ${prev.claim.status})`,
        });
      }
    } else {
      seen.set(x.claim.claim_id, x);
    }
  }
  return f;
}
