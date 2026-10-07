/**
 * Gate 0 (PRD): read Perpl's live settings on mainnet and testnet and persist raw
 * receipts. Read-only eth_calls; no keys, no funds. Every value is read from TWO
 * independent RPC providers at a pinned block and must agree, or the field stays PENDING.
 *
 *   pnpm gate0           -> proof/receipts/gate0.json
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { allNetworks, perplExchangeAbi, erc20Abi, type NetworkConfig } from "@imprest/core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function gitCommit(): string | null {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null; // repository has no commits yet
  }
}

const json = (v: unknown) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)));

async function readAll(client: PublicClient, net: NetworkConfig, blockNumber: bigint) {
  const ex = net.perpl.exchange as Address;
  const call = <T>(functionName: string, args: unknown[] = []) =>
    client.readContract({ address: ex, abi: perplExchangeAbi as any, functionName, args, blockNumber }) as Promise<T>;
  const [whitelistingEnabled, exchangeInfo, minAccountOpenCNS, version, halted] = await Promise.all([
    call<boolean>("whitelistingEnabled"),
    call<readonly unknown[]>("getExchangeInfo"),
    call<bigint>("getMinAccountOpenCNS"),
    call<readonly bigint[]>("getContractVersion"),
    call<boolean>("isHalted"),
  ]);
  const collateral = (exchangeInfo as any)[4] as Address;
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address: collateral, abi: erc20Abi, functionName: "symbol", blockNumber }),
    client.readContract({ address: collateral, abi: erc20Abi, functionName: "decimals", blockNumber }),
  ]);
  const markets: Record<string, unknown> = {};
  for (const m of net.perpl.markets) {
    const info: any = await call("getPerpetualInfo", [BigInt(m.perpId)]);
    markets[m.symbol] = {
      perpId: m.perpId,
      name: info.name,
      symbol: info.symbol,
      priceDecimals: info.priceDecimals,
      lotDecimals: info.lotDecimals,
      markPNS: info.markPNS,
      markTimestamp: info.markTimestamp,
      refPriceMaxAgeSec: info.refPriceMaxAgeSec,
      status: info.status,
      takerFeePer1e6: await call<bigint>("getTakerFee", [BigInt(m.perpId)]),
      configMatches: Number(info.priceDecimals) === m.priceDecimals && Number(info.lotDecimals) === m.lotDecimals,
    };
  }
  return {
    whitelistingEnabled,
    halted,
    contractVersion: version,
    collateralToken: collateral,
    collateralSymbol: symbol,
    collateralDecimals: decimals,
    exchangeBalanceCNS: (exchangeInfo as any)[0],
    minAccountOpenCNS,
    markets,
  };
}

async function gate(env: "testnet" | "mainnet") {
  const net = allNetworks()[env];
  const [primaryUrl, verifyUrl] = net.rpcUrls;
  const primary = createPublicClient({ transport: http(primaryUrl, { retryCount: 2 }) }) as PublicClient;
  const verify = createPublicClient({ transport: http(verifyUrl, { retryCount: 2 }) }) as PublicClient;
  const chainId = await primary.getChainId();
  const verifyChainId = await verify.getChainId();
  // Pin one block both providers have; a block a few back from the primary head.
  const head = await primary.getBlockNumber();
  const blockNumber = head - 5n;
  const block = await primary.getBlock({ blockNumber });
  const a = json(await readAll(primary, net, blockNumber));
  const b = json(await readAll(verify, net, blockNumber));
  const agree = JSON.stringify(a) === JSON.stringify(b);
  const configCollateralMatches = a.collateralToken.toLowerCase() === String(net.perpl.collateralToken).toLowerCase();
  return {
    id: `GATE0_${env.toUpperCase()}`,
    environment: env,
    network: env === "mainnet" ? "Monad Mainnet" : "Monad Testnet",
    chain_id: chainId,
    timestamp_utc: new Date(Number(block.timestamp) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    git_commit: gitCommit(),
    operation: "perpl_gate0_read",
    status: agree && chainId === net.chainId && verifyChainId === net.chainId ? `${env === "mainnet" ? "MAINNET" : "TESTNET"}_VERIFIED` : "PENDING",
    tx_hash: null,
    block_number: Number(blockNumber),
    contract: net.perpl.exchange,
    explorer_url: net.explorer ? `${net.explorer.url}${net.explorer.address}${net.perpl.exchange}` : null,
    inputs: { exchange: net.perpl.exchange, markets: net.perpl.markets, primary_rpc: primaryUrl, verification_rpc: verifyUrl },
    outputs: a,
    verification: {
      method: "read-only eth_call at a pinned block on two independent RPC providers",
      verification_rpc_chain_id: verifyChainId,
      readbacks_agree: agree,
      verification_readback: b,
      config_collateral_matches_chain: configCollateralMatches,
      config_market_decimals_match_chain: Object.values(a.markets).every((m: any) => m.configMatches),
    },
    notes:
      "Gate 0 decision: whitelistingEnabled=false means no Perpl whitelist prerequisite for desk contracts. Values are a snapshot at block_number; re-run before any deployment.",
  };
}

async function main() {
  const out: Record<string, unknown> = { gate: "GATE0", generated_by: "scripts/src/gate0.ts", receipts: [] as unknown[] };
  for (const env of ["testnet", "mainnet"] as const) {
    try {
      const r = await gate(env);
      (out.receipts as unknown[]).push(r);
      mkdirSync(resolve(ROOT, `proof/receipts/${env}`), { recursive: true });
      writeFileSync(resolve(ROOT, `proof/receipts/${env}/gate0.json`), JSON.stringify(r, null, 2));
      console.log(`${env}: block ${r.block_number} whitelist=${(r.outputs as any).whitelistingEnabled} collateral=${(r.outputs as any).collateralSymbol} agree=${(r.verification as any).readbacks_agree} -> ${r.status}`);
    } catch (e) {
      console.error(`${env}: FAILED`, (e as Error).message);
      (out.receipts as unknown[]).push({ id: `GATE0_${env.toUpperCase()}`, environment: env, status: "PENDING", error: String((e as Error).message) });
    }
  }
  mkdirSync(resolve(ROOT, "proof/receipts"), { recursive: true });
  writeFileSync(resolve(ROOT, "proof/receipts/gate0.json"), JSON.stringify(out, null, 2));
  console.log("wrote proof/receipts/gate0.json");
}

main();
