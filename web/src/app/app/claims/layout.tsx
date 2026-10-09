import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Claims and payout",
  description: "Claim realized profit above your high-water mark, or close a flat desk. Shares and fees are computed with the contract's own rules.",
  alternates: { canonical: "/app/claims" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
