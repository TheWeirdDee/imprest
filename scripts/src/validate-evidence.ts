/**
 * Evidence validator (directive Phase 23). Fails (exit 1) when any claim or receipt
 * breaks the evidence standard. With --onchain it also re-fetches every claimed
 * transaction from the network's RPC and checks block number and success status.
 *
 *   pnpm validate-evidence            # structural rules
 *   pnpm validate-evidence --onchain  # + live receipt checks
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, type Hex } from "viem";
import { allNetworks, crossCheck, validateClaim, validateReceipt, type Claim, type Finding, type Receipt } from "@imprest/core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, "/");
const exists = (p: string) => existsSync(resolve(ROOT, p));

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = resolve(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".json") ? [p] : [];
  });
}

async function main() {
  const findings: Finding[] = [];
  const claims: { file: string; claim: Claim }[] = [];
  for (const f of walk(resolve(ROOT, "proof/claims")).filter((f) => !f.endsWith("index.json"))) {
    const c = JSON.parse(readFileSync(f, "utf8")) as Claim;
    claims.push({ file: rel(f), claim: c });
    findings.push(...validateClaim(c, rel(f), exists));
  }
  findings.push(...crossCheck(claims));

  const receiptFiles = [
    ...walk(resolve(ROOT, "proof/receipts/testnet")),
    ...walk(resolve(ROOT, "proof/receipts/mainnet")),
    ...walk(resolve(ROOT, "proof/receipts/deployments")),
  ];
  for (const f of receiptFiles) {
    const r = JSON.parse(readFileSync(f, "utf8")) as Receipt;
    findings.push(...validateReceipt(r, rel(f)));
  }

  // Display files must never upgrade a claim: web code reads claims as-is.
  // Fabrication guard: a 64-hex string that looks like a tx hash anywhere in proof/ must
  // either be a claimed transaction or sit in a receipt with a tx_hash field.
  if (process.argv.includes("--onchain")) {
    const nets = allNetworks();
    for (const { file, claim } of claims) {
      if (!claim.transaction_hash) continue;
      const net = claim.chain_id === 143 ? nets.mainnet : claim.chain_id === 10143 ? nets.testnet : null;
      if (!net) {
        findings.push({ file, id: claim.claim_id, rule: "onchain", message: "transaction claimed on an unknown chain" });
        continue;
      }
      try {
        const client = createPublicClient({ transport: http(net.rpcUrls[1] ?? net.rpcUrls[0]) });
        const rc = await client.getTransactionReceipt({ hash: claim.transaction_hash as Hex });
        const want = claim.expected_tx_status ?? "success";
        if (rc.status !== want) findings.push({ file, id: claim.claim_id, rule: "onchain", message: `transaction status ${rc.status}, claim expects ${want}` });
        if (claim.block_number !== null && Number(rc.blockNumber) !== claim.block_number) {
          findings.push({ file, id: claim.claim_id, rule: "onchain", message: `block ${claim.block_number} != chain ${rc.blockNumber}` });
        }
      } catch (e) {
        findings.push({ file, id: claim.claim_id, rule: "onchain", message: `transaction not found: ${(e as Error).message}` });
      }
    }
  }

  const byStatus: Record<string, number> = {};
  for (const { claim } of claims) byStatus[claim.status] = (byStatus[claim.status] ?? 0) + 1;
  console.log(`claims: ${claims.length}`, byStatus, `receipts: ${receiptFiles.length}`);
  if (findings.length) {
    for (const f of findings) console.error(`FAIL ${f.file} [${f.id}] ${f.rule}: ${f.message}`);
    console.error(`evidence validation FAILED with ${findings.length} finding(s)`);
    process.exit(1);
  }
  console.log("evidence validation PASSED");
}

main();
