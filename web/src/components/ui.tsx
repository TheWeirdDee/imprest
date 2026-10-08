import type { ReactNode } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CircleDashed,
  CircleSlash,
  ExternalLink,
  FlaskConical,
  Info,
  Laptop,
  Target,
  ShieldCheck,
  ShieldAlert,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { explorerAddress, explorerTx } from "@imprest/core";
import { network } from "@/lib/env";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({
  title,
  icon: Icon,
  action,
  children,
  className,
  pad = true,
  id,
}: {
  title?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={cx("min-w-0 rounded-[var(--radius-card)] border border-line bg-surface", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-wide text-fg-2 uppercase">
            {Icon && <Icon size={14} aria-hidden className="text-muted" />}
            {title}
          </h2>
          {action}
        </header>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

/** A number with a label. `value === null` renders PENDING, never 0. */
export function Stat({
  label,
  value,
  unit,
  sub,
  tone,
  size = "md",
}: {
  label: ReactNode;
  value: ReactNode | null;
  unit?: string;
  sub?: ReactNode;
  tone?: "safe" | "warn" | "breach" | "muted";
  size?: "sm" | "md" | "lg";
}) {
  const toneCls =
    tone === "safe" ? "text-safe" : tone === "warn" ? "text-warn" : tone === "breach" ? "text-breach" : tone === "muted" ? "text-muted" : "text-fg";
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className={cx("num mt-0.5 truncate", size === "lg" ? "text-2xl font-semibold" : size === "sm" ? "text-sm" : "text-lg font-medium", toneCls)}>
        {value === null || value === undefined ? <Pending /> : value}
        {value !== null && value !== undefined && unit && <span className="ml-1 text-xs font-normal text-muted">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Pending({ label = "PENDING" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-warn/40 bg-warn-bg px-1.5 py-0.5 font-sans text-[11px] font-semibold tracking-wide text-warn">
      <Clock size={11} aria-hidden />
      {label}
    </span>
  );
}

const EVIDENCE: Record<string, { icon: LucideIcon; cls: string; text: string }> = {
  MAINNET_VERIFIED: { icon: BadgeCheck, cls: "border-safe/50 bg-safe-bg text-safe", text: "Mainnet verified" },
  TESTNET_VERIFIED: { icon: ShieldCheck, cls: "border-accent/50 bg-info-bg text-accent", text: "Testnet verified" },
  LOCAL_REPRODUCTION: { icon: Laptop, cls: "border-line-strong bg-surface-3 text-fg-2", text: "Local reproduction" },
  SIMULATED: { icon: FlaskConical, cls: "border-line-strong bg-surface-3 text-fg-2", text: "Simulated" },
  TARGET: { icon: Target, cls: "border-line-strong bg-surface-2 text-muted", text: "Target" },
  PENDING: { icon: Clock, cls: "border-warn/40 bg-warn-bg text-warn", text: "Pending" },
  FAIL: { icon: CircleSlash, cls: "border-breach/50 bg-breach-bg text-breach", text: "Failed" },
};

export function EvidenceBadge({ status }: { status: string }) {
  const e = EVIDENCE[status] ?? EVIDENCE.PENDING!;
  const Icon = e.icon;
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap", e.cls)}>
      <Icon size={11} aria-hidden />
      {e.text}
    </span>
  );
}

export type Tone = "safe" | "warn" | "breach" | "info";

const TONE: Record<Tone, { icon: LucideIcon; cls: string }> = {
  safe: { icon: ShieldCheck, cls: "border-safe/40 bg-safe-bg text-safe" },
  warn: { icon: AlertTriangle, cls: "border-warn/40 bg-warn-bg text-warn" },
  breach: { icon: ShieldAlert, cls: "border-breach/50 bg-breach-bg text-breach" },
  info: { icon: Info, cls: "border-line-strong bg-info-bg text-info" },
};

export function Pill({ tone, children, icon }: { tone: Tone; children: ReactNode; icon?: LucideIcon }) {
  const t = TONE[tone];
  const Icon = icon ?? t.icon;
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", t.cls)}>
      <Icon size={12} aria-hidden />
      {children}
    </span>
  );
}

export function Notice({ tone, title, children }: { tone: Tone; title: ReactNode; children?: ReactNode }) {
  const t = TONE[tone];
  const Icon = t.icon;
  return (
    <div role={tone === "breach" ? "alert" : "status"} className={cx("flex gap-3 rounded-lg border p-3 text-sm", t.cls)}>
      <Icon size={16} aria-hidden className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="font-semibold">{title}</div>
        {children && <div className="mt-1 text-fg-2">{children}</div>}
      </div>
    </div>
  );
}

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "ghost" | "long" | "short" | "danger";

/**
 * The one button language. Primary: brand accent (one per view). Secondary: neutral surface
 * with a border. Tertiary: text only. Long/short/danger are trading semantics, not brand.
 * Used by <Button> and by links styled as buttons, so both always look the same.
 */
export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" | "lg" = "md", className?: string) {
  const v = {
    primary: "bg-accent text-on-accent hover:bg-accent-strong",
    secondary: "border border-line-strong bg-surface text-fg hover:bg-surface-2",
    tertiary: "text-accent hover:underline underline-offset-4 px-0!",
    ghost: "text-fg-2 hover:bg-surface-2 hover:text-fg",
    long: "bg-long text-on-accent hover:brightness-110",
    short: "bg-short text-on-accent hover:brightness-110",
    danger: "border border-breach/60 bg-breach-bg text-breach hover:brightness-110",
  }[variant];
  const z = { sm: "min-h-8 px-3 py-1.5 text-[13px]", md: "min-h-9 px-3.5 py-2 text-sm", lg: "min-h-11 px-4.5 py-2.5 text-sm" }[size];
  // A caller that hides the button responsively ("hidden md:inline-flex") owns the display
  // utility; otherwise the base inline-flex would win over "hidden" in the generated CSS.
  const display = className && /(^|\s)hidden(\s|$)/.test(className) ? "" : "inline-flex";
  return cx(
    display,
    "items-center justify-center gap-2 rounded-[var(--radius-sm)] font-semibold whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-45",
    z,
    v,
    className,
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  disabled,
  onClick,
  type = "button",
  className,
  ariaLabel,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button type={type} aria-label={ariaLabel} disabled={disabled} onClick={onClick} className={buttonClass(variant, size, className)}>
      {children}
    </button>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded bg-surface-3", className)} />;
}

export function EmptyState({ icon: Icon = CircleDashed, title, children }: { icon?: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <Icon size={22} aria-hidden className="text-muted" />
      <div className="text-sm font-medium text-fg-2">{title}</div>
      {children && <div className="max-w-md text-xs leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

export function TxLink({ hash, label }: { hash: string; label?: string }) {
  const url = explorerTx(network, hash);
  const text = label ?? `${hash.slice(0, 10)}…${hash.slice(-6)}`;
  if (!url) return <span className="num text-fg-2">{text}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="num inline-flex items-center gap-1 text-accent hover:underline">
      {text}
      <ExternalLink size={11} aria-hidden />
      <span className="sr-only">(opens explorer)</span>
    </a>
  );
}

export function AddressLink({ address, label }: { address: string; label?: string }) {
  const url = explorerAddress(network, address);
  const text = label ?? `${address.slice(0, 6)}…${address.slice(-4)}`;
  if (!url) return <span className="num text-fg-2">{text}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="num inline-flex items-center gap-1 text-accent hover:underline">
      {text}
      <ExternalLink size={11} aria-hidden />
      <span className="sr-only">(opens explorer)</span>
    </a>
  );
}

export function KV({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-muted">{k}</span>
      <span className="num text-right text-fg">{v}</span>
    </div>
  );
}

/** The one text-input style (order ticket, desk stake, cohort select). */
export const inputClass = (className?: string) =>
  cx(
    "w-full rounded-[var(--radius-sm)] border border-line-strong bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20",
    className,
  );
