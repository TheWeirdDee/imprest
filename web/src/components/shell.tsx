"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  BookOpen,
  CandlestickChart,
  FileCheck2,
  Gauge,
  History,
  Landmark,
  LayoutDashboard,
  Layers,
  Menu,
  MoreHorizontal,
  Receipt,
  ServerCog,
  Wallet,
  X,
} from "lucide-react";
import { network, deployed } from "@/lib/env";
import { buttonClass, cx } from "./ui";
import { AccountButton } from "./account-button";
import { ThemeCycleButton, ThemeToggle } from "./theme-toggle";

/** Compact network indicator. A testnet build always says so, without shouting. */
export function NetworkPill({ className }: { className?: string }) {
  if (network.environment === "mainnet") return null;
  const local = network.environment === "development";
  return (
    <span
      role="note"
      aria-label={`${network.label} environment`}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap",
        local ? "border-breach/30 bg-breach-bg text-breach" : "border-line-strong bg-surface text-fg-2",
        className,
      )}
    >
      <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", local ? "bg-breach" : "bg-warn")} />
      {local ? "Local chain · no value" : "Monad Testnet · test tokens only"}
    </span>
  );
}

/** Kept for compatibility with pages that rendered the old banner. */
export function EnvBanner() {
  return null;
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight", className)}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <rect width="24" height="24" rx="5" fill="var(--color-accent)" />
        <path d="M7 16.5V7.5M12 16.5V10M17 16.5V12.5" stroke="var(--color-on-accent)" strokeWidth="2" strokeLinecap="round" />
      </svg>
      Imprest
    </span>
  );
}

const SITE_LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#how", label: "How it works" },
  { href: "/#risk", label: "Risk" },
  { href: "/proof", label: "Proof" },
  { href: "/lp", label: "LP" },
  { href: "/docs", label: "Docs" },
  { href: "/status", label: "Status" },
];

/** Closes on Escape and locks page scroll while a mobile menu or sheet is open. */
function useOverlay(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useOverlay(open, close);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-1 lg:gap-6">
          <button
            className="-ml-2 rounded-[var(--radius-sm)] p-2 text-fg-2 hover:bg-surface-2 lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={19} /> : <Menu size={19} />}
          </button>
          <Link href="/" className="text-fg" aria-label="Imprest home" onClick={close}>
            <Logo />
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-0.5 lg:flex">
            {SITE_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-fg-2 hover:bg-surface-2 hover:text-fg">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden xl:block">
            <NetworkPill />
          </span>
          <ThemeToggle className="hidden lg:inline-flex" />
          <ThemeCycleButton className="lg:hidden" />
          <Link href="/app" className={buttonClass("primary", "sm", "hidden sm:inline-flex")}>
            Open app
          </Link>
        </div>
      </div>
      {open && (
        <div id="site-menu" className="fixed inset-x-0 top-14 bottom-0 z-40 overflow-y-auto border-t border-line bg-surface px-4 pt-3 pb-8 lg:hidden">
          <nav aria-label="Primary mobile" className="flex flex-col">
            {SITE_LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={close} className="rounded-[var(--radius-sm)] px-2 py-3 text-[15px] text-fg hover:bg-surface-2">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
            <NetworkPill className="self-start" />
            <ThemeToggle withLabels className="w-full" />
            <Link href="/app" onClick={close} className={buttonClass("primary", "lg", "w-full")}>
              Open app
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

const APP_NAV = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/app/trade/btc", label: "Trade", icon: CandlestickChart },
  { href: "/app/risk", label: "Risk", icon: Gauge },
  { href: "/app/desk", label: "Desk & graduation", icon: Layers },
  { href: "/app/positions", label: "Positions", icon: Activity },
  { href: "/app/history", label: "History", icon: History },
  { href: "/app/claims", label: "Claims", icon: Wallet },
  { href: "/app/proof", label: "My receipts", icon: Receipt },
];

const SECONDARY = [
  { href: "/lp", label: "LP console", icon: Landmark },
  { href: "/proof", label: "Proof", icon: FileCheck2 },
  { href: "/docs", label: "Docs", icon: BookOpen },
  { href: "/status", label: "Status", icon: ServerCog },
];

/** One-handed bottom bar: the four most used screens plus More. */
const MOBILE_NAV = [
  { href: "/app", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/app/trade/btc", label: "Trade", icon: CandlestickChart },
  { href: "/app/positions", label: "Positions", icon: Activity },
  { href: "/app/risk", label: "Risk", icon: Gauge },
];
const MORE = [
  { href: "/app/claims", label: "Claims", icon: Wallet },
  { href: "/app/history", label: "History", icon: History },
  { href: "/app/desk", label: "Desk & graduation", icon: Layers },
  { href: "/app/proof", label: "My receipts", icon: Receipt },
  ...SECONDARY,
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const closeMore = useCallback(() => setMore(false), []);
  useOverlay(more, closeMore);
  useEffect(() => setMore(false), [path]);
  const active = (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(href.replace(/\/btc$/, "")));
  const moreActive = MORE.some((n) => active(n.href));
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex min-h-0 flex-1">
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line bg-surface lg:flex">
          <Link href="/" className="flex h-14 items-center border-b border-line px-4 text-fg" aria-label="Imprest home">
            <Logo />
          </Link>
          <nav aria-label="App" className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
            {APP_NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active(n.href, n.exact) ? "page" : undefined}
                className={cx(
                  "flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm",
                  active(n.href, n.exact) ? "bg-accent-bg font-medium text-accent" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
                )}
              >
                <n.icon size={15} aria-hidden />
                {n.label}
              </Link>
            ))}
            <div className="my-2 border-t border-line" />
            {SECONDARY.map((n) => (
              <Link key={n.href} href={n.href} className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                <n.icon size={15} aria-hidden />
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="border-t border-line p-3 text-[11px] leading-relaxed text-muted">
            <div className="font-medium text-fg-2">{network.environment === "testnet" ? "Monad Testnet" : network.label}</div>
            <div className="num">chain {network.chainId}</div>
            <div>{deployed ? "Contracts deployed" : "Contracts: pending deployment"}</div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-line bg-surface/95 px-3 backdrop-blur sm:px-4">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/" className="text-fg lg:hidden" aria-label="Imprest home">
                <Logo />
              </Link>
              <span className="hidden md:block">
                <NetworkPill />
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle className="hidden md:inline-flex" />
              <ThemeCycleButton className="md:hidden" />
              <AccountButton />
            </div>
          </header>
          <main id="main" className="min-w-0 flex-1 px-3 pt-4 pb-24 sm:px-5 lg:pb-8">
            {children}
          </main>
        </div>
      </div>

      {more && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="More">
          <button aria-label="Close" className="absolute inset-0 bg-black/40" onClick={closeMore} />
          <div className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-[var(--radius-lg)] border-t border-line bg-surface px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+5rem)]">
            <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />
            <nav aria-label="More pages" className="grid grid-cols-2 gap-1">
              {MORE.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={closeMore}
                  aria-current={active(n.href) ? "page" : undefined}
                  className={cx(
                    "flex items-center gap-2.5 rounded-[var(--radius-sm)] px-3 py-3 text-sm",
                    active(n.href) ? "bg-accent-bg text-accent" : "text-fg hover:bg-surface-2",
                  )}
                >
                  <n.icon size={16} aria-hidden />
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
              <NetworkPill className="self-start" />
              <ThemeToggle withLabels className="w-full" />
            </div>
          </div>
        </div>
      )}

      <nav
        aria-label="App mobile"
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        {MOBILE_NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active(n.href, n.exact) ? "page" : undefined}
            className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px]", active(n.href, n.exact) && !more ? "text-accent" : "text-muted")}
          >
            <n.icon size={19} aria-hidden />
            {n.label}
          </Link>
        ))}
        <button
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          aria-haspopup="dialog"
          className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px]", more || moreActive ? "text-accent" : "text-muted")}
        >
          <MoreHorizontal size={19} aria-hidden />
          More
        </button>
      </nav>
    </div>
  );
}
