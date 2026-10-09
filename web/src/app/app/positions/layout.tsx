import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Positions",
  description: "Open Perpl positions held by your desk: size, entry, mark, margin and unrealized PnL.",
  alternates: { canonical: "/app/positions" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
