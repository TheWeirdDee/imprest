import { describe, expect, it, beforeEach } from "vitest";
import { encodeErrorResult, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deskAbi, deskDomain, toWire, tradeIntentTypes, type OrderIntent } from "@imprest/core";
import { createRelayer, type ChainPort } from "../src/handler";

const TRADER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const OTHER = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const DESK = "0x00000000000000000000000000000000000000d1" as Address;
const NOW = 1_800_000_000;

const order: OrderIntent = { perpId: 16n, side: 0, priceLimit: 1_001_000n, lots: 100n, leverage: 500n, reduceOnly: false, fillOrKill: false };

async function sign(o: OrderIntent, nonce: bigint, deadline: bigint, who = TRADER, desk = DESK) {
  return who.signTypedData({ domain: deskDomain(10143, desk), types: tradeIntentTypes, primaryType: "TradeIntent", message: { ...o, nonce, deadline } });
}

interface Fake extends ChainPort {
  submitted: { o: OrderIntent; nonce: bigint; deadline: bigint; sig: Hex; gas: bigint }[];
  lastNonce: bigint;
  simulateError: unknown;
  gasEstimate: bigint;
}

function fakeChain(): Fake {
  const f: Fake = {
    chainId: 10143,
    submitted: [],
    lastNonce: 0n,
    simulateError: null,
    gasEstimate: 600_000n,
    isDesk: async (d) => d.toLowerCase() === DESK.toLowerCase(),
    deskTrader: async () => TRADER.address,
    deskLastNonce: async () => f.lastNonce,
    simulate: async () => {
      if (f.simulateError) throw f.simulateError;
    },
    estimateGas: async () => f.gasEstimate,
    submit: async (desk, o, nonce, deadline, sig, gas) => {
      f.submitted.push({ o, nonce, deadline, sig, gas });
      return ("0x" + "ab".repeat(32)) as Hex;
    },
    relayerAddress: () => "0x000000000000000000000000000000000000beef",
    relayerBalance: async () => 10n ** 18n,
    receipt: async () => null,
  };
  return f;
}

let chain: Fake;
let handle: (r: Request) => Promise<Response>;
const logs: Record<string, unknown>[] = [];

beforeEach(() => {
  chain = fakeChain();
  logs.length = 0;
  handle = createRelayer(chain, {
    maxGas: 1_200_000n,
    gasHeadroomPct: 115n,
    quotaPerTraderPerMin: 3,
    maxDeadlineAheadSec: 600,
    now: () => NOW,
    log: (o) => logs.push(o),
  });
});

const post = (body: unknown) =>
  handle(new Request("http://relayer/v1/intents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("relayer", () => {
  it("answers a browser CORS preflight with an empty 204 (regression: a body made it throw)", async () => {
    const r = await handle(
      new Request("http://relayer/v1/intents", {
        method: "OPTIONS",
        headers: { origin: "https://imprest-chi.vercel.app", "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
      }),
    );
    expect(r.status).toBe(204);
    expect(await r.text()).toBe("");
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("access-control-allow-headers")).toContain("content-type");
    expect(r.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("submits a valid intent with exactly the signed fields", async () => {
    const dl = BigInt(NOW + 60);
    const sig = await sign(order, 1n, dl);
    const r = await post(toWire(10143, DESK, order, 1n, dl, sig));
    expect(r.status).toBe(202);
    expect(chain.submitted).toHaveLength(1);
    const s = chain.submitted[0]!;
    expect(s.o).toEqual(order);
    expect(s.nonce).toBe(1n);
    expect(s.deadline).toBe(dl);
    expect(s.sig).toBe(sig);
    expect(s.gas).toBe((600_000n * 115n) / 100n);
  });

  it("rejects a signature from someone other than the trader (malicious signer)", async () => {
    const dl = BigInt(NOW + 60);
    const r = await post(toWire(10143, DESK, order, 1n, dl, await sign(order, 1n, dl, OTHER)));
    expect(r.status).toBe(401);
    expect(chain.submitted).toHaveLength(0);
  });

  it("rejects every altered field (relayer cannot modify signed intent)", async () => {
    const dl = BigInt(NOW + 60);
    const sig = await sign(order, 1n, dl);
    const variants: OrderIntent[] = [
      { ...order, lots: 101n },
      { ...order, priceLimit: order.priceLimit + 1n },
      { ...order, leverage: 400n },
      { ...order, side: 1 },
      { ...order, reduceOnly: true },
      { ...order, fillOrKill: true },
      { ...order, perpId: 32n },
    ];
    for (const v of variants) {
      const r = await post(toWire(10143, DESK, v, 1n, dl, sig));
      expect(r.status).toBe(401);
    }
    expect((await post(toWire(10143, DESK, order, 2n, dl, sig))).status).toBe(401);
    expect((await post(toWire(10143, DESK, order, 1n, dl + 1n, sig))).status).toBe(401);
    expect(chain.submitted).toHaveLength(0);
  });

  it("rejects replay of a used nonce", async () => {
    chain.lastNonce = 5n;
    const dl = BigInt(NOW + 60);
    const r = await post(toWire(10143, DESK, order, 5n, dl, await sign(order, 5n, dl)));
    expect(r.status).toBe(409);
    expect(chain.submitted).toHaveLength(0);
  });

  it("rejects stale and too-distant deadlines", async () => {
    const stale = BigInt(NOW);
    expect((await post(toWire(10143, DESK, order, 1n, stale, await sign(order, 1n, stale)))).status).toBe(410);
    const far = BigInt(NOW + 3600);
    expect((await post(toWire(10143, DESK, order, 1n, far, await sign(order, 1n, far)))).status).toBe(400);
    expect(chain.submitted).toHaveLength(0);
  });

  it("refuses desks that are not registered by the factory, and wrong chains", async () => {
    const dl = BigInt(NOW + 60);
    const other = "0x00000000000000000000000000000000000000d2" as Address;
    const sig = await sign(order, 1n, dl, TRADER, other);
    expect((await post(toWire(10143, other, order, 1n, dl, sig))).status).toBe(404);
    expect((await post(toWire(1, DESK, order, 1n, dl, await sign(order, 1n, dl)))).status).toBe(400);
  });

  it("does not submit when simulation reverts, and names the contract error", async () => {
    chain.simulateError = Object.assign(new Error("reverted"), {
      data: encodeErrorResult({ abi: deskAbi as any, errorName: "LeverageExceeded", args: [600n, 500n] }),
    });
    const dl = BigInt(NOW + 60);
    const r = await post(toWire(10143, DESK, order, 1n, dl, await sign(order, 1n, dl)));
    expect(r.status).toBe(422);
    const j = await r.json();
    expect(j.code).toBe("LEVERAGE_EXCEEDED");
    expect(chain.submitted).toHaveLength(0);
  });

  it("enforces the per-trader quota", async () => {
    const dl = BigInt(NOW + 60);
    for (let i = 1n; i <= 3n; i++) {
      chain.lastNonce = i - 1n;
      expect((await post(toWire(10143, DESK, order, i, dl, await sign(order, i, dl)))).status).toBe(202);
    }
    chain.lastNonce = 3n;
    expect((await post(toWire(10143, DESK, order, 4n, dl, await sign(order, 4n, dl)))).status).toBe(429);
  });

  it("refuses gas above the cap (Monad charges the limit)", async () => {
    chain.gasEstimate = 2_000_000n;
    const dl = BigInt(NOW + 60);
    expect((await post(toWire(10143, DESK, order, 1n, dl, await sign(order, 1n, dl)))).status).toBe(422);
    expect(chain.submitted).toHaveLength(0);
  });

  it("rejects malformed bodies", async () => {
    expect((await post({ hello: 1 })).status).toBe(400);
    const r = await handle(new Request("http://relayer/v1/intents", { method: "POST", body: "not json" }));
    expect(r.status).toBe(400);
  });

  it("never logs signatures", async () => {
    const dl = BigInt(NOW + 60);
    const sig = await sign(order, 1n, dl);
    await post(toWire(10143, DESK, order, 1n, dl, sig));
    expect(JSON.stringify(logs)).not.toContain(sig.slice(2, 40));
  });
});
