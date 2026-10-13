import type { Metadata } from "next";
import { pageMeta } from "@/lib/meta";
import type { ReactNode } from "react";

export const metadata: Metadata = pageMeta("Risk center", "How close your desk is to its limits: risk floor, daily loss, leverage, exposure, credit and fee cap.", "/app/risk");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
