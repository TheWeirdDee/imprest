/** Node adapter: `pnpm --filter @imprest/relayer start`. Reads keys from the environment only. */
import { createServer } from "node:http";
import type { Hex } from "viem";
import { getNetwork } from "@imprest/core";
import { viemChain } from "./chain";
import { createRelayer } from "./handler";

const env = process.env.IMPREST_ENV ?? "testnet";
const net = getNetwork(env);
const key = process.env.RELAYER_PRIVATE_KEY as Hex | undefined;
if (!key) {
  console.error(JSON.stringify({ level: "fatal", msg: "RELAYER_PRIVATE_KEY is not set (owner action: fund a dedicated relayer key with testnet MON)" }));
  process.exit(1);
}
const handle = createRelayer(viemChain(net, key, process.env.MONAD_TESTNET_RPC_URL || net.rpcUrls[0]), {
  maxGas: BigInt(process.env.RELAYER_MAX_GAS ?? "1200000"),
  gasHeadroomPct: 115n,
  quotaPerTraderPerMin: Number(process.env.RELAYER_QUOTA_PER_TRADER_PER_MIN ?? "20"),
  maxDeadlineAheadSec: 600,
  now: () => Math.floor(Date.now() / 1000),
  // Structured logs; signatures and keys are never logged.
  log: (o) => console.log(JSON.stringify({ ts: new Date().toISOString(), service: "relayer", env, ...o })),
});

const port = Number(process.env.RELAYER_PORT ?? 8787);
createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const r = await handle(
    new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers as Record<string, string>, body: req.method === "GET" || req.method === "HEAD" ? undefined : body }),
  );
  const headers: Record<string, string> = {};
  r.headers.forEach((v, k) => (headers[k] = v));
  res.writeHead(r.status, headers);
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log(JSON.stringify({ service: "relayer", msg: `listening on :${port}`, chainId: net.chainId })));
