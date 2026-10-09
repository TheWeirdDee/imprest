import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Trade",
  description: "Trade BTC and ETH perpetuals on Perpl through your desk. Every order is checked against the desk's risk policy before it reaches the venue.",
  alternates: { canonical: "/app/trade" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
