import { getNetwork, isDeployed, type NetworkConfig } from "@imprest/core";

/** Network the web app runs against. Resolved once from NEXT_PUBLIC_IMPREST_ENV; no silent default to mainnet. */
const ENV = process.env.NEXT_PUBLIC_IMPREST_ENV ?? "testnet";

export const network: NetworkConfig = getNetwork(ENV);
export const deployed = isDeployed(network);
export const relayerUrl = process.env.NEXT_PUBLIC_RELAYER_URL || null;
export const indexerUrl = process.env.NEXT_PUBLIC_INDEXER_URL || null;
export const passkeyRpId = process.env.NEXT_PUBLIC_PASSKEY_RP_ID || null;

/** The dev mock account can only ever exist on the local development network. */
export const devMockAllowed =
  network.environment === "development" && process.env.NEXT_PUBLIC_ENABLE_DEV_MOCK_ACCOUNT === "true";

export const primaryRpc = network.rpcUrls[0]!;
/** Independent provider used for post-transaction readback; never the same URL as primary. */
export const verifyRpc = network.rpcUrls[1] ?? null;
