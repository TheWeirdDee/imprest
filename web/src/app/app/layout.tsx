import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/shell";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s · Imprest" },
  description: "Your desk at a glance: equity, restricted credit, risk buffer, positions, payout eligibility and recent activity, read from chain.",
  alternates: { canonical: "/app" },
};

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
