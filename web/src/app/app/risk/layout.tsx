import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Risk center",
  description: "How close your desk is to its limits: risk floor, daily loss, leverage, exposure, credit and fee cap.",
  alternates: { canonical: "/app/risk" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
