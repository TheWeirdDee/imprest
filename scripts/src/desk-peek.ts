/** Read-only snapshot of a desk's risk state (no keys needed). */
import { createPublicClient, http, type Address } from "viem";
import { deskAbi, getNetwork } from "@imprest/core";
const net = getNetwork("testnet");
const pc = createPublicClient({ transport: http(net.rpcUrls[0]) });
const r: any = await pc.readContract({ address: process.argv[2] as Address, abi: deskAbi, functionName: "riskState" });
console.log(JSON.stringify(r, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
