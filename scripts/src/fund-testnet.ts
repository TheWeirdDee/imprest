/**
 * Moves testnet MON from the deployer to a service wallet. Prints addresses and amounts only.
 *
 *   pnpm --filter @imprest/scripts fund-testnet -- <address> <mon>
 */
import { createPublicClient, createWalletClient, defineChain, formatEther, http, isAddress, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getNetwork } from "@imprest/core";

const [to, amount] = process.argv.slice(2).filter((a) => a !== "--");
if (!to || !isAddress(to) || !amount) throw new Error("usage: fund-testnet <address> <mon>");
const key = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
if (!key) throw new Error("DEPLOYER_PRIVATE_KEY not set");
const net = getNetwork("testnet");
const chain = defineChain({ id: net.chainId, name: "Monad Testnet", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [net.rpcUrls[0]!] } } });
const from = privateKeyToAccount(key);
const pc = createPublicClient({ chain, transport: http(net.rpcUrls[0]) });
const wc = createWalletClient({ chain, account: from, transport: http(net.rpcUrls[0]) });
const hash = await wc.sendTransaction({ to, value: parseEther(amount), gas: 21_000n });
const rc = await pc.waitForTransactionReceipt({ hash });
console.log(JSON.stringify({ from: from.address, to, mon: amount, tx: hash, status: rc.status, deployerLeft: formatEther(await pc.getBalance({ address: from.address })), recipientNow: formatEther(await pc.getBalance({ address: to })) }));
