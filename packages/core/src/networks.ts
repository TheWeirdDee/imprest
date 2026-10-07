import networksJson from "../../../config/networks.json";

export type EnvName = "development" | "testnet" | "mainnet";

export interface MarketConfig {
  symbol: string;
  perpId: number;
  priceDecimals: number;
  lotDecimals: number;
}

export interface NetworkConfig {
  environment: EnvName;
  label: "LOCAL" | "TESTNET" | "MAINNET";
  chainId: number;
  rpcUrls: string[];
  nativeSymbol: string;
  explorer: { name: string; url: string; tx: string; address: string; alt?: { name: string; url: string } } | null;
  faucet?: string;
  ausdFaucet?: { address: `0x${string}`; function: string; dripAmount: string; maxAmountToOwn: string; maxDripFrequencySec: number } | null;
  perpl: {
    exchange: `0x${string}` | null;
    collateralToken: `0x${string}` | null;
    collateralSymbol: string;
    collateralDecimals: number;
    apiUrl?: string;
    wsUrl?: string;
    markets: MarketConfig[];
    source?: string;
    verifiedAt?: string;
  };
  imprest: {
    pool: `0x${string}` | null;
    factory: `0x${string}` | null;
    deployBlock: number | null;
    cohorts: Record<string, number>;
  };
}

const all = networksJson as unknown as Record<EnvName, NetworkConfig>;

export function isEnvName(v: unknown): v is EnvName {
  return v === "development" || v === "testnet" || v === "mainnet";
}

/** The one place a network is resolved. Throws instead of silently defaulting. */
export function getNetwork(env: string | undefined): NetworkConfig {
  if (!isEnvName(env)) {
    throw new Error(`IMPREST_ENV must be development | testnet | mainnet (got ${String(env)})`);
  }
  return all[env];
}

export function allNetworks(): Record<EnvName, NetworkConfig> {
  return all;
}

export function explorerTx(net: NetworkConfig, hash: string): string | null {
  return net.explorer ? `${net.explorer.url}${net.explorer.tx}${hash}` : null;
}

export function explorerAddress(net: NetworkConfig, address: string): string | null {
  return net.explorer ? `${net.explorer.url}${net.explorer.address}${address}` : null;
}

/** True when Imprest contracts for this environment have a recorded deployment. */
export function isDeployed(net: NetworkConfig): boolean {
  return Boolean(net.imprest.pool && net.imprest.factory);
}

export function marketById(net: NetworkConfig, perpId: number): MarketConfig | undefined {
  return net.perpl.markets.find((m) => m.perpId === perpId);
}

export function marketBySymbol(net: NetworkConfig, symbol: string): MarketConfig | undefined {
  return net.perpl.markets.find((m) => m.symbol.toLowerCase() === symbol.toLowerCase());
}
