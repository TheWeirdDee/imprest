import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import type { ReactNode } from "react";

export const metadata: Metadata = pageMeta("LP risk console", "Pool state read from chain and confirmed on a second RPC: assets, deployed principal, exposure caps and every desk's risk.", "/lp");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
