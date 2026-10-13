import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import type { ReactNode } from "react";

export const metadata: Metadata = pageMeta("My receipts", "Verification receipts for the transactions you sent from this app, each read back on an independent RPC.", "/app/proof");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
