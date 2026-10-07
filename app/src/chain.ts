import { createPublicClient, createWalletClient, defineChain, http, type Abi, type Hex, type LocalAccount, type PublicClient } from "viem";
import { getNetwork, isDeployed } from "@imprest/core";

/** Same single config as the web app (config/networks.json via @imprest/core). */
export const network = getNetwork(process.env.EXPO_PUBLIC_IMPREST_ENV ?? "testnet");
export const deployed = isDeployed(network);
export const passkeyRpId = process.env.EXPO_PUBLIC_PASSKEY_RP_ID ?? null;

export const chain = defineChain({
  id: network.chainId,
  name: network.environment === "testnet" ? "Monad Testnet" : network.environment,
  nativeCurrency: { name: network.nativeSymbol, symbol: network.nativeSymbol, decimals: 18 },
  rpcUrls: { default: { http: [network.rpcUrls[0]!] } },
});

export const primary = createPublicClient({ chain, transport: http(network.rpcUrls[0]) }) as PublicClient;
/** Independent provider for post-transaction readback. */
export const verify = network.rpcUrls[1] ? (createPublicClient({ chain, transport: http(network.rpcUrls[1]) }) as PublicClient) : null;

/** Simulates, then sends with a tight gas limit (Monad charges the limit). */
export async function sendWrite(account: LocalAccount, w: { address: Hex; abi: Abi | readonly unknown[]; functionName: string; args?: readonly unknown[] }): Promise<Hex> {
  const { request } = await primary.simulateContract({ account, ...(w as any) });
  const gas = await primary.estimateContractGas({ account, ...(w as any) });
  const wallet = createWalletClient({ account, chain, transport: http(network.rpcUrls[0]) });
  return wallet.writeContract({ ...(request as any), gas: (gas * 115n) / 100n });
}

/** Perpl market data. Native apps are not subject to CORS, so no proxy is needed. */
export async function fetchTicker(perpId: number): Promise<{ mark: number | null; prev: number | null; ts: number }> {
  if (!network.perpl.apiUrl) throw new Error("no market data API for this network");
  const r = await fetch(`${network.perpl.apiUrl}/v1/market-data/${perpId}/ticker`);
  if (!r.ok) throw new Error(`Perpl API ${r.status}`);
  const d = (await r.json())?.d?.[String(perpId)];
  return { mark: d?.mrk ?? null, prev: d?.prv ?? null, ts: d?.at?.t ?? 0 };
}
