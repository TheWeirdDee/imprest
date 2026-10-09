import { NextResponse } from "next/server";
import { network } from "@/lib/env";

/** Which commit this deployment was built from, so hosted behaviour can be tied to source. */
export function GET() {
  return NextResponse.json(
    {
      commit: process.env.NEXT_PUBLIC_BUILD_SHA ?? "unknown",
      builtAt: process.env.NEXT_PUBLIC_BUILD_TIME ?? null,
      deployment: process.env.NEXT_PUBLIC_BUILD_ENV ?? "unknown",
      network: network.environment,
      chainId: network.chainId,
      repository: "https://github.com/TheWeirdDee/imprest",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
