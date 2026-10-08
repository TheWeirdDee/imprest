"use client";
import { createPublicClient, defineChain, fallback, http, type PublicClient } from "viem";
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

/** In the browser, reads go through the app's read-only proxy (CORS + 429 retries); on the server, direct. */
function readUrl(which: "primary" | "verify"): string {
  const direct = which === "primary" ? primaryRpc : verifyRpc!;
  return typeof window === "undefined" ? direct : `${window.location.origin}/api/rpc/${which}`;
}

export function primaryClient(): PublicClient {
  // Reads fall back to the second provider when the public RPC refuses or stalls; money
  // confirmations still use verifyClient() separately.
  const opts = { retryCount: 1, timeout: 20_000 }; // unbatched so the proxy cache can dedupe identical reads
  primary ??= createPublicClient({ chain, transport: fallback(verifyRpc ? [http(readUrl("primary"), opts), http(readUrl("verify"), opts)] : [http(readUrl("primary"), opts)]) }) as PublicClient;
  return primary;
}

/** Second, independent RPC. Null when the environment has only one provider. */
export function verifyClient(): PublicClient | null {
  if (!verifyRpc) return null;
  verify ??= createPublicClient({ chain, transport: http(readUrl("verify"), { retryCount: 1, timeout: 12_000 }) }) as PublicClient;
  return verify;
}
