import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "My receipts",
  description: "Verification receipts for the transactions you sent from this app, each read back on an independent RPC.",
  alternates: { canonical: "/app/proof" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
