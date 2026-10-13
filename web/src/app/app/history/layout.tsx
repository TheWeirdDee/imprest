import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import type { ReactNode } from "react";

export const metadata: Metadata = pageMeta("History", "Every desk event: trades, fees, graduation, claims and settlement, with transaction links.", "/app/history");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
