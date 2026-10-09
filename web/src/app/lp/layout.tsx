import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "LP risk console",
  description: "Pool state read from chain and confirmed on a second RPC: assets, deployed principal, exposure caps and every desk's risk.",
  alternates: { canonical: "/lp" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
