import { createPublicClient, createWalletClient, defineChain, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deskAbi, deskFactoryAbi, type NetworkConfig, type OrderIntent } from "@imprest/core";
import type { ChainPort } from "./handler";

/** viem-backed ChainPort. The relayer key only pays gas; it holds no authority over desks. */
export function viemChain(net: NetworkConfig, privateKey: Hex, rpcUrl = net.rpcUrls[0]!): ChainPort {
  if (!net.imprest.factory) throw new Error(`no Imprest deployment recorded for ${net.environment}`);
  const chain = defineChain({
    id: net.chainId,
    name: net.environment,
    nativeCurrency: { name: net.nativeSymbol, symbol: net.nativeSymbol, decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const account = privateKeyToAccount(privateKey);
  const pc = createPublicClient({ chain, transport: http(rpcUrl) });
  const wc = createWalletClient({ chain, account, transport: http(rpcUrl) });
  const factory = net.imprest.factory as Address;
  const args = (o: OrderIntent, nonce: bigint, deadline: bigint, sig: Hex) =>
    [{ perpId: o.perpId, side: o.side, priceLimit: o.priceLimit, lots: o.lots, leverage: o.leverage, reduceOnly: o.reduceOnly, fillOrKill: o.fillOrKill }, nonce, deadline, sig] as const;
  return {
    chainId: net.chainId,
    isDesk: async (desk) => (await pc.readContract({ address: factory, abi: deskFactoryAbi, functionName: "isDesk", args: [desk] })) as boolean,
    deskTrader: async (desk) => (await pc.readContract({ address: desk, abi: deskAbi, functionName: "trader" })) as Address,
    deskLastNonce: async (desk) => (await pc.readContract({ address: desk, abi: deskAbi, functionName: "lastNonce" })) as bigint,
    simulate: async (desk, o, n, d, s) => {
      await pc.simulateContract({ account, address: desk, abi: deskAbi, functionName: "tradeWithSig", args: args(o, n, d, s) as any });
    },
    estimateGas: (desk, o, n, d, s) => pc.estimateContractGas({ account, address: desk, abi: deskAbi, functionName: "tradeWithSig", args: args(o, n, d, s) as any }),
    submit: (desk, o, n, d, s, gas) => wc.writeContract({ address: desk, abi: deskAbi, functionName: "tradeWithSig", args: args(o, n, d, s) as any, gas }),
    relayerAddress: () => account.address,
    relayerBalance: () => pc.getBalance({ address: account.address }),
    receipt: async (hash) => {
      try {
        const r = await pc.getTransactionReceipt({ hash });
        return { status: r.status, blockNumber: r.blockNumber };
      } catch {
        return null;
      }
    },
  };
}
