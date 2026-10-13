import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import type { ReactNode } from "react";

export const metadata: Metadata = pageMeta("Positions", "Open Perpl positions held by your desk: size, entry, mark, margin and unrealized PnL.", "/app/positions");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
