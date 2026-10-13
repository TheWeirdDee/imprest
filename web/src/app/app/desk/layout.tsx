import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import type { ReactNode } from "react";

export const metadata: Metadata = pageMeta("Desk and graduation", "Open an evaluation desk, see your cohort's tiers and graduation requirements, and graduate when the contract says you qualify.", "/app/desk");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
