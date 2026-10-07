/**
 * Imprest relayer. Verifies trader-signed EIP-712 order intents, simulates them, and
 * submits Desk.tradeWithSig with a tight gas limit (Monad charges the limit). It can only
 * submit exactly what the trader signed: the intent's fields go into calldata unchanged,
 * and the Desk contract re-verifies signature, nonce and deadline on-chain anyway.
 *
 * Runtime-agnostic: a fetch-style handler (Cloudflare Worker or Node via src/node.ts).
 */
import { recoverTypedDataAddress, type Address, type Hex } from "viem";
import {
  decodeRevert,
  deskDomain,
  fromWire,
  revertDataFromError,
  tradeIntentTypes,
  type OrderIntent,
  type SignedIntentWire,
} from "@imprest/core";

export interface ChainPort {
  chainId: number;
  /** Desk registry membership from the factory (authoritative on-chain read). */
  isDesk(desk: Address): Promise<boolean>;
  deskTrader(desk: Address): Promise<Address>;
  deskLastNonce(desk: Address): Promise<bigint>;
  /** eth_call of tradeWithSig; throws with revert data on failure. */
  simulate(desk: Address, o: OrderIntent, nonce: bigint, deadline: bigint, sig: Hex): Promise<void>;
  estimateGas(desk: Address, o: OrderIntent, nonce: bigint, deadline: bigint, sig: Hex): Promise<bigint>;
  submit(desk: Address, o: OrderIntent, nonce: bigint, deadline: bigint, sig: Hex, gas: bigint): Promise<Hex>;
  relayerAddress(): Address;
  relayerBalance(): Promise<bigint>;
  receipt(hash: Hex): Promise<{ status: "success" | "reverted"; blockNumber: bigint } | null>;
}

export interface RelayerConfig {
  maxGas: bigint;
  gasHeadroomPct: bigint; // e.g. 115n
  quotaPerTraderPerMin: number;
  maxDeadlineAheadSec: number;
  now: () => number; // unix seconds
  log: (o: Record<string, unknown>) => void;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v)), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });

export function createRelayer(chain: ChainPort, cfg: RelayerConfig) {
  const windows = new Map<string, number[]>();

  function quotaOk(trader: string): boolean {
    const now = cfg.now();
    const w = (windows.get(trader) ?? []).filter((t) => t > now - 60);
    if (w.length >= cfg.quotaPerTraderPerMin) {
      windows.set(trader, w);
      return false;
    }
    w.push(now);
    windows.set(trader, w);
    return true;
  }

  async function handleIntent(req: Request): Promise<Response> {
    const opId = crypto.randomUUID();
    let wire: SignedIntentWire;
    try {
      wire = (await req.json()) as SignedIntentWire;
    } catch {
      return json(400, { error: "body must be JSON", operation_id: opId });
    }
    let parsed: ReturnType<typeof fromWire>;
    try {
      parsed = fromWire(wire);
    } catch (e) {
      return json(400, { error: (e as Error).message, operation_id: opId });
    }
    const { order, nonce, deadline } = parsed;
    const desk = wire.desk as Address;
    const log = (o: Record<string, unknown>) => cfg.log({ operation_id: opId, desk, nonce: nonce.toString(), ...o });

    if (wire.chainId !== chain.chainId) return json(400, { error: `wrong chain ${wire.chainId}`, operation_id: opId });
    if (!/^0x[0-9a-fA-F]{40}$/.test(desk)) return json(400, { error: "desk must be an address", operation_id: opId });
    const now = cfg.now();
    if (deadline <= BigInt(now)) {
      log({ result: "rejected", code: "DEADLINE_EXPIRED" });
      return json(410, { error: "deadline already passed", code: "DEADLINE_EXPIRED", operation_id: opId });
    }
    if (deadline > BigInt(now + cfg.maxDeadlineAheadSec)) {
      return json(400, { error: `deadline more than ${cfg.maxDeadlineAheadSec}s ahead`, operation_id: opId });
    }
    if (!(await chain.isDesk(desk))) return json(404, { error: "not an Imprest desk", operation_id: opId });

    const trader = await chain.deskTrader(desk);
    let signer: Address;
    try {
      signer = await recoverTypedDataAddress({
        domain: deskDomain(chain.chainId, desk),
        types: tradeIntentTypes,
        primaryType: "TradeIntent",
        message: { ...order, nonce, deadline },
        signature: wire.signature,
      });
    } catch {
      log({ result: "rejected", code: "INVALID_SIGNATURE" });
      return json(401, { error: "signature does not recover", code: "INVALID_SIGNATURE", operation_id: opId });
    }
    if (signer.toLowerCase() !== trader.toLowerCase()) {
      log({ result: "rejected", code: "INVALID_SIGNATURE", signer });
      return json(401, { error: "signed by someone other than the desk's trader, or fields were altered", code: "INVALID_SIGNATURE", operation_id: opId });
    }
    const last = await chain.deskLastNonce(desk);
    if (nonce <= last) {
      log({ result: "rejected", code: "NONCE_INVALID", last: last.toString() });
      return json(409, { error: `nonce ${nonce} already used (last ${last})`, code: "NONCE_INVALID", operation_id: opId });
    }
    if (!quotaOk(trader.toLowerCase())) {
      log({ result: "rejected", code: "QUOTA" });
      return json(429, { error: "per-trader relayer quota exceeded; self-submit or retry in a minute", operation_id: opId });
    }

    // Simulate first: Monad charges the gas limit, so failed submissions are not free.
    try {
      await chain.simulate(desk, order, nonce, deadline, wire.signature);
    } catch (e) {
      const data = revertDataFromError(e);
      const ae = decodeRevert(data);
      log({ result: "simulation_reverted", code: ae.code, contract_error: ae.contractError });
      return json(422, { error: `${ae.title}. ${ae.message}`, code: ae.code, revertData: data, operation_id: opId });
    }
    let gas: bigint;
    try {
      gas = ((await chain.estimateGas(desk, order, nonce, deadline, wire.signature)) * cfg.gasHeadroomPct) / 100n;
    } catch (e) {
      return json(502, { error: `gas estimation failed: ${(e as Error).message}`, operation_id: opId });
    }
    if (gas > cfg.maxGas) {
      log({ result: "rejected", code: "GAS_CAP", gas: gas.toString() });
      return json(422, { error: `gas ${gas} above relayer cap ${cfg.maxGas}`, operation_id: opId });
    }
    try {
      const txHash = await chain.submit(desk, order, nonce, deadline, wire.signature, gas);
      log({ result: "submitted", tx: txHash, gas: gas.toString(), trader });
      return json(202, { txHash, gas, operation_id: opId, note: "submitted; not final until verified" });
    } catch (e) {
      log({ result: "submit_failed", error: (e as Error).message });
      return json(502, { error: `submission failed: ${(e as Error).message}`, operation_id: opId });
    }
  }

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return json(204, {});
    if (req.method === "GET" && url.pathname === "/health") {
      try {
        const bal = await chain.relayerBalance();
        return json(200, { ok: true, chainId: chain.chainId, relayer: chain.relayerAddress(), balanceWei: bal });
      } catch (e) {
        return json(503, { ok: false, error: (e as Error).message });
      }
    }
    if (req.method === "POST" && url.pathname === "/v1/intents") return handleIntent(req);
    const m = /^\/v1\/tx\/(0x[0-9a-fA-F]{64})$/.exec(url.pathname);
    if (req.method === "GET" && m) {
      const r = await chain.receipt(m[1] as Hex);
      return json(200, r ? { state: r.status === "success" ? "executed" : "failed", blockNumber: r.blockNumber } : { state: "submitted" });
    }
    return json(404, { error: "not found" });
  };
}
