import type { ReactNode } from "react";
import { AppShell } from "@/components/shell";
import { DeskProvider } from "@/lib/desk-context";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <DeskProvider>
      <AppShell>{children}</AppShell>
    </DeskProvider>
  );
}
