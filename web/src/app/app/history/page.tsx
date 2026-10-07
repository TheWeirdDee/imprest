"use client";

import { History } from "lucide-react";
import { Card } from "@/components/ui";
import { RequireDesk } from "@/components/gates";
import { HistoryList } from "@/components/history";

export default function HistoryPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <History size={20} aria-hidden className="text-accent" /> History
      </h1>
      <Card pad={false}>
        <RequireDesk what="history">
          <HistoryList />
        </RequireDesk>
      </Card>
    </div>
  );
}
