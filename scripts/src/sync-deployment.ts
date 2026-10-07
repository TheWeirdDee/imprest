/**
 * After `forge script script/Deploy.s.sol --broadcast`, records the deployment:
 *  - reads contracts/broadcast/Deploy.s.sol/<chainId>/run-latest.json
 *  - fetches every deployment receipt on BOTH configured RPCs
 *  - compares deployed runtime code to the compiled bytecode (immutables masked)
 *  - writes proof/receipts/deployments/<env>-<Contract>.json
 *  - records pool/factory/deployBlock/cohorts in config/networks.json
 *
 *   IMPREST_ENV=testnet pnpm --filter @imprest/scripts sync-deployment
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, type Hex } from "viem";
import { getNetwork } from "@imprest/core";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// Rehearsals redirect every write (proof/, config/, .secrets/) away from the real repo.
const ROOT = process.env.IMPREST_OUTPUT_ROOT ? resolve(process.env.IMPREST_OUTPUT_ROOT) : REPO;
const env = process.env.IMPREST_ENV ?? "testnet";
const net = getNetwork(env);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function maskImmutables(code: string, refs: Record<string, { start: number; length: number }[]> | undefined): string {
  const b = code.startsWith("0x") ? code.slice(2) : code;
  const chars = b.split("");
  for (const list of Object.values(refs ?? {})) {
    for (const r of list) for (let i = r.start * 2; i < (r.start + r.length) * 2; i++) chars[i] = "0";
  }
  return chars.join("").toLowerCase();
}

async function main() {
  const bpath = resolve(REPO, `contracts/broadcast/Deploy.s.sol/${net.chainId}/run-latest.json`);
  if (!existsSync(bpath)) throw new Error(`no broadcast at ${bpath}; run the deploy first`);
  const run = JSON.parse(readFileSync(bpath, "utf8"));
  const rpcs = process.env.IMPREST_RPC_PRIMARY ? [process.env.IMPREST_RPC_PRIMARY, process.env.IMPREST_RPC_VERIFY ?? process.env.IMPREST_RPC_PRIMARY] : net.rpcUrls.slice(0, 2);
  const clients = rpcs.map((u) => ({ url: u, c: createPublicClient({ transport: http(u, { retryCount: 3 }) }) }));
  let commit: string | null = null;
  try {
    commit = execSync("git rev-parse HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    commit = null;
  }
  const created = (run.transactions as any[]).filter((t) => t.transactionType === "CREATE" && ["ImprestPool", "DeskFactory"].includes(t.contractName));
  if (created.length < 2) throw new Error("broadcast does not contain ImprestPool and DeskFactory deployments");
  mkdirSync(resolve(ROOT, "proof/receipts/deployments"), { recursive: true });
  const addresses: Record<string, string> = {};
  let firstBlock = Number.MAX_SAFE_INTEGER;
  for (const t of created) {
    const name = t.contractName as string;
    const art = JSON.parse(readFileSync(resolve(REPO, `contracts/out/${name}.sol/${name}.json`), "utf8"));
    const readbacks = [];
    for (const { url, c } of clients) {
      const rc = await c.getTransactionReceipt({ hash: t.hash as Hex });
      const code = (await c.getCode({ address: t.contractAddress })) ?? "0x";
      const block = await c.getBlock({ blockNumber: rc.blockNumber });
      readbacks.push({ rpc: url, status: rc.status, blockNumber: Number(rc.blockNumber), contractAddress: rc.contractAddress, from: rc.from, codeSha256: sha(code.toLowerCase()), maskedMatches: maskImmutables(code, art.deployedBytecode.immutableReferences) === maskImmutables(art.deployedBytecode.object, art.deployedBytecode.immutableReferences), timestamp: Number(block.timestamp) });
    }
    const a = readbacks[0]!;
    const agree = readbacks.every((r) => r.status === "success" && r.blockNumber === a.blockNumber && r.codeSha256 === a.codeSha256 && r.contractAddress?.toLowerCase() === String(t.contractAddress).toLowerCase());
    const ok = agree && readbacks.every((r) => r.maskedMatches);
    firstBlock = Math.min(firstBlock, a.blockNumber);
    addresses[name] = t.contractAddress;
    const receipt = {
      id: `${env.toUpperCase()}_DEPLOY_${name.toUpperCase()}`,
      environment: env,
      network: env === "mainnet" ? "Monad Mainnet" : "Monad Testnet",
      chain_id: net.chainId,
      timestamp_utc: new Date(a.timestamp * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
      git_commit: commit,
      operation: "deploy",
      // a rehearsal against a fork or redirected output is never a network result
      status: ok ? (process.env.IMPREST_OUTPUT_ROOT || process.env.IMPREST_RPC_PRIMARY ? "SIMULATED" : env === "mainnet" ? "MAINNET_VERIFIED" : "TESTNET_VERIFIED") : "PENDING",
      tx_hash: t.hash,
      block_number: a.blockNumber,
      contract: t.contractAddress,
      contract_name: name,
      address: t.contractAddress,
      deployer: a.from,
      explorer_url: net.explorer ? `${net.explorer.url}${net.explorer.address}${t.contractAddress}` : null,
      inputs: { constructor_arguments: t.arguments ?? [], compiler: "solc 0.8.28, optimizer 200, via-IR, evm cancun" },
      outputs: { abi_sha256: sha(JSON.stringify(art.abi)), compiled_runtime_sha256: sha(String(art.deployedBytecode.object).toLowerCase()) },
      verification: { method: "receipt + code read on two independent RPCs; runtime compared to compiled bytecode with immutables masked", readbacks, readbacks_agree: agree, source_verification: "PENDING (Monadscan API key: owner action)" },
      notes: ok ? "" : "readbacks disagree or bytecode mismatch: do not use",
    };
    writeFileSync(resolve(ROOT, `proof/receipts/deployments/${env}-${name}.json`), JSON.stringify(receipt, null, 2));
    console.log(`${name} ${t.contractAddress} block ${a.blockNumber} -> ${receipt.status}`);
  }
  const cfgPath = resolve(ROOT, "config/networks.json");
  mkdirSync(resolve(ROOT, "config"), { recursive: true });
  const cfg = JSON.parse(readFileSync(existsSync(cfgPath) ? cfgPath : resolve(REPO, "config/networks.json"), "utf8"));
  cfg[env].imprest = { pool: addresses.ImprestPool, factory: addresses.DeskFactory, deployBlock: firstBlock, cohorts: { "demo-v0": 0, "standard-v0": 1 } };
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  console.log(`config/networks.json updated for ${env}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
