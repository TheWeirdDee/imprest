"use client";
import { createPublicClient, defineChain, http, type PublicClient } from "viem";
import { network, primaryRpc, verifyRpc } from "./env";

export const chain = defineChain({
  id: network.chainId,
  name: network.environment === "mainnet" ? "Monad" : network.environment === "testnet" ? "Monad Testnet" : "Local",
  nativeCurrency: { name: network.nativeSymbol, symbol: network.nativeSymbol, decimals: 18 },
  rpcUrls: { default: { http: [primaryRpc] } },
  blockExplorers: network.explorer ? { default: { name: network.explorer.name, url: network.explorer.url } } : undefined,
});

let primary: PublicClient | null = null;
let verify: PublicClient | null = null;

export function primaryClient(): PublicClient {
  primary ??= createPublicClient({ chain, transport: http(primaryRpc, { retryCount: 2, batch: { wait: 16 } }) }) as PublicClient;
  return primary;
}

/** Second, independent RPC. Null when the environment has only one provider. */
export function verifyClient(): PublicClient | null {
  if (!verifyRpc) return null;
  verify ??= createPublicClient({ chain, transport: http(verifyRpc, { retryCount: 2 }) }) as PublicClient;
  return verify;
}
