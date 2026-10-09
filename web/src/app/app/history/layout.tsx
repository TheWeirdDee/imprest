import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "History",
  description: "Every desk event: trades, fees, graduation, claims and settlement, with transaction links.",
  alternates: { canonical: "/app/history" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
