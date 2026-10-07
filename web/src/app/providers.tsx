"use client";
import type { ReactNode } from "react";
import { AccountProvider } from "@/lib/account/AccountProvider";

export function Providers({ children }: { children: ReactNode }) {
  return <AccountProvider>{children}</AccountProvider>;
}
