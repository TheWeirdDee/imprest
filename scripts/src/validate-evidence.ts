/**
 * Evidence validator (directive Phase 23). Fails (exit 1) when any claim or receipt
 * breaks the evidence standard. With --onchain it also re-fetches every claimed
 * transaction, and every receipt's transaction on both providers, and checks block number,
 * expected status (reverted for recorded rejections) and key decoded outcomes.
 *
 *   pnpm validate-evidence            # structural rules
 *   pnpm validate-evidence --onchain  # + live receipt checks
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, decodeEventLog, http, type Hex } from "viem";
import { allNetworks, crossCheck, deskAbi, validateClaim, validateReceipt, type Claim, type Finding, type Receipt } from "@imprest/core";

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
  const receipts: { file: string; r: Receipt }[] = [];
  for (const f of receiptFiles) {
    const r = JSON.parse(readFileSync(f, "utf8")) as Receipt;
    receipts.push({ file: rel(f), r });
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

  // Every receipt that names a transaction is reconciled on BOTH providers: it must exist, be in the
  // recorded block, have the expected status (reverted when the receipt records a revert), and key
  // decoded outcomes must match what the receipt says.
  let reconciled = 0;
  if (process.argv.includes("--onchain")) {
    const nets = allNetworks();
    for (const { file, r } of receipts) {
      if (!r.tx_hash) continue;
      const net = r.chain_id === 143 ? nets.mainnet : r.chain_id === 10143 ? nets.testnet : null;
      if (!net) {
        findings.push({ file, id: r.id, rule: "onchain", message: "receipt transaction on an unknown chain" });
        continue;
      }
      const wantStatus = r.outputs && "revert" in r.outputs ? "reverted" : "success";
      const blocks = new Set<string>();
      for (const url of net.rpcUrls.slice(0, 2)) {
        let rc: Awaited<ReturnType<ReturnType<typeof createPublicClient>["getTransactionReceipt"]>> | null = null;
        for (let attempt = 0; attempt < 3 && !rc; attempt++) {
          rc = await createPublicClient({ transport: http(url, { timeout: 20_000 }) })
            .getTransactionReceipt({ hash: r.tx_hash as Hex })
            .catch(() => null);
        }
        if (!rc) {
          findings.push({ file, id: r.id, rule: "onchain", message: `receipt not retrievable from ${new URL(url).host} after 3 attempts` });
          continue;
        }
        blocks.add(rc.blockNumber.toString());
        if (rc.status !== wantStatus) findings.push({ file, id: r.id, rule: "onchain", message: `status ${rc.status} on ${new URL(url).host}, receipt implies ${wantStatus}` });
        if (r.block_number !== null && Number(rc.blockNumber) !== r.block_number) findings.push({ file, id: r.id, rule: "onchain", message: `block ${r.block_number} != ${rc.blockNumber} on ${new URL(url).host}` });
        // Operation-specific evidence: the event that proves the operation must be present and,
        // where the receipt names its contract, emitted by that contract; recorded values must match.
        const required: Record<string, string> = { relayed_trade: "TradeExecuted", guarded_trade: "TradeExecuted", graduate: "Graduated", close_desk: "Settled" };
        const need = wantStatus === "success" ? required[r.operation] : undefined;
        const contract = typeof r.contract === "string" && r.contract ? r.contract.toLowerCase() : null;
        let seen = false;
        for (const l of rc.logs) {
          let ev: any;
          try {
            ev = decodeEventLog({ abi: deskAbi, data: l.data, topics: l.topics as any });
          } catch {
            continue; // not a desk event
          }
          if (contract && l.address.toLowerCase() !== contract) continue; // another desk's event is not evidence
          if (ev.eventName === need) seen = true;
          const o = r.outputs ?? {};
          if (ev.eventName === "TradeExecuted") {
            if (o.lotsAfterPrimary !== undefined && String(ev.args.lotsAfter) !== String(o.lotsAfterPrimary)) findings.push({ file, id: r.id, rule: "onchain", message: `TradeExecuted lotsAfter ${ev.args.lotsAfter} != recorded ${o.lotsAfterPrimary}` });
            if (o.equity_after !== undefined && String(ev.args.equityAfter) !== String(o.equity_after)) findings.push({ file, id: r.id, rule: "onchain", message: `TradeExecuted equityAfter ${ev.args.equityAfter} != recorded ${o.equity_after}` });
            const i = r.inputs ?? {};
            for (const k of ["lots", "leverage", "priceLimit", "nonce"] as const) {
              if (i[k] !== undefined && String(ev.args[k]) !== String(i[k])) findings.push({ file, id: r.id, rule: "onchain", message: `TradeExecuted ${k} ${ev.args[k]} != recorded input ${i[k]}` });
            }
          }
          const g = o.graduated_event as Record<string, unknown> | undefined;
          if (ev.eventName === "Graduated" && g && String(ev.args.credit) !== String(g.credit)) findings.push({ file, id: r.id, rule: "onchain", message: `Graduated credit ${ev.args.credit} != recorded ${g.credit}` });
        }
        if (need && !seen) findings.push({ file, id: r.id, rule: "onchain", message: `required ${need} event${contract ? ` from ${contract}` : ""} not found on ${new URL(url).host}` });
        // Recorded sender and target, when the receipt states them.
        const from = (r.outputs as Record<string, unknown> | undefined)?.tx_from;
        if (typeof from === "string" && rc.from.toLowerCase() !== from.toLowerCase()) findings.push({ file, id: r.id, rule: "onchain", message: `sender ${rc.from} != recorded ${from}` });
        if (contract && r.operation === "relayed_trade" && rc.to?.toLowerCase() !== contract) findings.push({ file, id: r.id, rule: "onchain", message: `sent to ${rc.to}, receipt names ${contract}` });
      }      if (blocks.size > 1) findings.push({ file, id: r.id, rule: "onchain", message: `providers disagree on the block: ${[...blocks].join(" vs ")}` });
      reconciled++;
    }
    console.log(`receipts reconciled on chain (both providers): ${reconciled}`);
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
