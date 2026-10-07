"use client";

import { Activity } from "lucide-react";
import { Card } from "@/components/ui";
import { RequireDesk } from "@/components/gates";
import { PositionsTable } from "@/components/positions-table";

export default function PositionsPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <Activity size={20} aria-hidden className="text-accent" /> Positions
      </h1>
      <Card pad={false}>
        <RequireDesk what="positions">
          <PositionsTable />
        </RequireDesk>
      </Card>
    </div>
  );
}
