import type { Metadata } from "next";
import type { ReactNode } from "react";
import { network } from "@/lib/env";
import { pageMeta } from "@/lib/meta";

/** Each market page has its own title, canonical URL and share card (the page itself is client-side). */
export async function generateMetadata({ params }: { params: Promise<{ market: string }> }): Promise<Metadata> {
  const { market } = await params;
  const m = network.perpl.markets.find((x) => x.symbol.toLowerCase() === market.toLowerCase());
  if (!m) return { title: "Market not found" };
  const meta = pageMeta(
    `Trade ${m.symbol}-PERP`,
    `Trade ${m.symbol} perpetuals on Perpl through your Imprest desk. Every order is checked against the desk's risk policy by the contract before it reaches the venue.`,
    `/app/trade/${m.symbol.toLowerCase()}`,
  );
  // The parent trade layout's plain title stops the "· Imprest" template here, so set it in full.
  return { ...meta, title: { absolute: `Trade ${m.symbol}-PERP · Imprest` } };
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
