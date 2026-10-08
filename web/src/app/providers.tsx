"use client";
import type { ReactNode } from "react";
import { AccountProvider } from "@/lib/account/AccountProvider";
import { DeskProvider } from "@/lib/desk-context";
import { ThemeProvider } from "@/lib/theme";

/**
 * Mounted once at the root, so client-side navigation between any two pages (app, LP, proof,
 * docs, status) never remounts the session or refetches the desk from scratch.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AccountProvider>
        <DeskProvider>{children}</DeskProvider>
      </AccountProvider>
    </ThemeProvider>
  );
}
