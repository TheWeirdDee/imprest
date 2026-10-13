import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import type { ReactNode } from "react";

export const metadata: Metadata = pageMeta("Trade", "Trade BTC and ETH perpetuals on Perpl through your desk. Every order is checked against the desk's risk policy before it reaches the venue.", "/app/trade");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
