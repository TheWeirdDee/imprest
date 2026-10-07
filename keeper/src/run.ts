/**
 * Imprest keeper. Watches every desk through direct RPC reads (never the indexer), proposes
 * enforce / graduate / checkpoint, SIMULATES each call, and sends only calls the contract
 * accepts in simulation. The contract decides; the keeper observes.
 *
 *   KEEPER_PRIVATE_KEY=0x... IMPREST_ENV=testnet pnpm --filter @imprest/keeper start
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deskAbi, deskFactoryAbi, getNetwork, toAppError, toCohortPolicy, type CohortPolicy, type RiskState } from "@imprest/core";
import { decide } from "./decide";

const env = process.env.IMPREST_ENV ?? "testnet";
const net = getNetwork(env);
const key = process.env.KEEPER_PRIVATE_KEY as Hex | undefined;
const POLL_MS = Number(process.env.KEEPER_POLL_MS ?? 2000);
const GRADUATE = process.env.KEEPER_GRADUATE !== "false";
const CHECKPOINT_AFTER = Number(process.env.KEEPER_CHECKPOINT_AFTER_SEC ?? 6 * 3600);
const DRY_RUN = process.env.KEEPER_DRY_RUN === "true";

const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ ts: new Date().toISOString(), service: "keeper", env, ...o }));

if (!net.imprest.factory) {
  log({ level: "fatal", msg: `no Imprest deployment recorded for ${env} in config/networks.json` });
  process.exit(1);
}
if (!key && !DRY_RUN) {
  log({ level: "fatal", msg: "KEEPER_PRIVATE_KEY not set (or set KEEPER_DRY_RUN=true to observe only)" });
  process.exit(1);
}

const chain = defineChain({
  id: net.chainId,
  name: env,
  nativeCurrency: { name: net.nativeSymbol, symbol: net.nativeSymbol, decimals: 18 },
  rpcUrls: { default: { http: [net.rpcUrls[0]!] } },
});
const pc = createPublicClient({ chain, transport: http(net.rpcUrls[0]) });
const account = key ? privateKeyToAccount(key) : null;
const wc = account ? createWalletClient({ chain, account, transport: http(net.rpcUrls[0]) }) : null;
const factory = net.imprest.factory as Address;

const desks: Address[] = [];
const policies = new Map<Address, CohortPolicy>();
const closed = new Set<Address>();
const stats = { loops: 0, lastLoopAt: null as string | null, actionsSent: 0, simulationsRejected: 0, errors: 0, watched: 0 };

async function syncDesks() {
  const total = Number((await pc.readContract({ address: factory, abi: deskFactoryAbi, functionName: "deskTotal" })) as bigint);
  for (let i = desks.length; i < total; i++) {
    desks.push((await pc.readContract({ address: factory, abi: deskFactoryAbi, functionName: "allDesks", args: [BigInt(i)] })) as Address);
  }
}

async function act(desk: Address, fn: "enforce" | "graduate" | "checkpoint", why: string) {
  const opId = randomUUID();
  try {
    const { request } = await pc.simulateContract({ account: account ?? "0x0000000000000000000000000000000000000001", address: desk, abi: deskAbi, functionName: fn });
    if (DRY_RUN || !wc) {
      log({ operation_id: opId, desk, action: fn, why, result: "dry_run_simulation_ok" });
      return;
    }
    const gas = ((await pc.estimateContractGas({ account: account!, address: desk, abi: deskAbi, functionName: fn })) * 115n) / 100n;
    const gasPrice = await pc.getGasPrice();
    const hash = await wc.writeContract({ ...(request as any), gas });
    stats.actionsSent++;
    const rc = await pc.waitForTransactionReceipt({ hash, timeout: 60_000 });
    log({
      operation_id: opId,
      desk,
      action: fn,
      why,
      tx: hash,
      block: rc.blockNumber.toString(),
      result: rc.status,
      gas_used: rc.gasUsed.toString(),
      // Monad charges the gas LIMIT; record both for keeper-economics evidence.
      gas_limit: gas.toString(),
      gas_price_wei: gasPrice.toString(),
      cost_wei_at_limit: (gas * gasPrice).toString(),
    });
  } catch (e) {
    stats.simulationsRejected++;
    const ae = toAppError(e);
    log({ operation_id: opId, desk, action: fn, why, result: "not_sent", code: ae.code, contract_error: ae.contractError });
  }
}

async function loop() {
  try {
    await syncDesks();
    const nowSec = Math.floor(Date.now() / 1000);
    for (const desk of desks) {
      if (closed.has(desk)) continue;
      const r = (await pc.readContract({ address: desk, abi: deskAbi, functionName: "riskState" })) as unknown as RiskState;
      if (r.status === 2) {
        closed.add(desk);
        continue;
      }
      if (!policies.has(desk)) policies.set(desk, toCohortPolicy(await pc.readContract({ address: desk, abi: deskAbi, functionName: "policy" })));
      const lastAccrualTs = (await pc.readContract({ address: desk, abi: deskAbi, functionName: "lastAccrualTs" })) as bigint;
      const a = decide(r, policies.get(desk)!, { graduate: GRADUATE, checkpointAfterSec: CHECKPOINT_AFTER, nowSec, lastAccrualTs });
      if (a.kind === "enforce") await act(desk, "enforce", a.reason);
      else if (a.kind === "graduate") await act(desk, "graduate", `eligible for tier ${a.toTier}`);
      else if (a.kind === "checkpoint") await act(desk, "checkpoint", a.reason);
    }
    stats.loops++;
    stats.watched = desks.length - closed.size;
    stats.lastLoopAt = new Date().toISOString();
  } catch (e) {
    stats.errors++;
    log({ level: "error", msg: (e as Error).message.split("\n")[0] });
  }
  setTimeout(loop, POLL_MS);
}

createServer((_, res) => {
  res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify({ ok: true, chainId: net.chainId, keeper: account?.address ?? null, dryRun: DRY_RUN, ...stats }));
}).listen(Number(process.env.KEEPER_PORT ?? 8788));

log({ msg: "keeper started", chainId: net.chainId, factory, dryRun: DRY_RUN, keeper: account?.address ?? null });
void loop();
