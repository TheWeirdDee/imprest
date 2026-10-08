"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { cx } from "./ui";

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
];

/** Light / System / Dark. `withLabels` shows text (used in the mobile menu). */
export function ThemeToggle({ withLabels = false, className }: { withLabels?: boolean; className?: string }) {
  const t = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className={cx(className?.includes("hidden") ? "" : "inline-flex", "items-center rounded-[var(--radius-sm)] border border-line bg-surface-2 p-0.5", className)}
    >
      {OPTIONS.map((o) => {
        const on = t.choice === o.value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            aria-label={`${o.label} theme`}
            title={`${o.label} theme`}
            onClick={() => t.setChoice(o.value)}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-[5px] px-2 py-1 text-xs",
              on ? "bg-surface text-fg shadow-[0_1px_2px_rgba(0,0,0,0.12)]" : "text-muted hover:text-fg",
              withLabels && "flex-1 justify-center py-1.5",
            )}
          >
            <o.icon size={14} aria-hidden />
            {withLabels && o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Compact single button for narrow headers: cycles Light -> Dark -> System. */
export function ThemeCycleButton({ className }: { className?: string }) {
  const t = useTheme();
  const order: ThemeChoice[] = ["light", "dark", "system"];
  const cur = OPTIONS.find((o) => o.value === t.choice)!;
  const next = order[(order.indexOf(t.choice) + 1) % order.length]!;
  return (
    <button
      onClick={() => t.setChoice(next)}
      aria-label={`Theme: ${cur.label}. Switch to ${next}`}
      title={`Theme: ${cur.label}`}
      className={cx("rounded-[var(--radius-sm)] p-2 text-fg-2 hover:bg-surface-2", className)}
    >
      <cur.icon size={18} aria-hidden />
    </button>
  );
}
