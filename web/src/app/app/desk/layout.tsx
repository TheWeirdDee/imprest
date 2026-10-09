import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Desk and graduation",
  description: "Open an evaluation desk, see your cohort's tiers and graduation requirements, and graduate when the contract says you qualify.",
  alternates: { canonical: "/app/desk" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
