import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import type { ReactNode } from "react";

export const metadata: Metadata = pageMeta("Claims and payout", "Claim realized profit above your high-water mark, or close a flat desk. Shares and fees are computed with the contract's own rules.", "/app/claims");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
