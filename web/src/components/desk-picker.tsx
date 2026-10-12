"use client";

import { useDesk } from "@/lib/desk-context";
import { inputClass } from "./ui";

/** Shown only when the account has more than one desk; newest first, latest selected by default. */
export function DeskPicker() {
  const d = useDesk();
  if (d.allDesks.length < 2) return null;
  const desks = [...d.allDesks].reverse();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="shrink-0 text-muted">Desk</span>
      <select
        aria-label="Choose desk"
        value={d.desk ?? ""}
        onChange={(e) => d.selectDesk(e.target.value === desks[0] ? null : (e.target.value as `0x${string}`))}
        className={inputClass("num w-auto py-1.5")}
      >
        {desks.map((x, i) => (
          <option key={x} value={x}>
            {`${x.slice(0, 6)}…${x.slice(-4)}`}
            {i === 0 ? " (latest)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
