"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
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
  Receipt,
  ServerCog,
  Wallet,
  X,
} from "lucide-react";
import { network, deployed } from "@/lib/env";
import { cx } from "./ui";
import { AccountButton } from "./account-button";

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
        <rect width="24" height="24" rx="5" fill="var(--color-fg)" />
        <path d="M7 16.5V7.5M12 16.5V10M17 16.5V12.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
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

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-fg" aria-label="Imprest home">
            <Logo />
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-0.5 lg:flex">
            {SITE_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-md px-2.5 py-1.5 text-sm text-fg-2 hover:bg-surface-2 hover:text-fg">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:block"><NetworkPill /></span>
          <Link href="/app" className="hidden rounded-md bg-fg px-3 py-1.5 text-sm font-medium text-white hover:bg-fg-2 sm:inline-block">
            Open app
          </Link>
          <button
            className="rounded-md p-2 text-fg-2 hover:bg-surface-2 lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
      <div className="flex justify-center border-t border-line py-1.5 sm:hidden">
        <NetworkPill />
      </div>
      {open && (
        <nav aria-label="Primary mobile" className="border-t border-line bg-surface px-4 py-2 lg:hidden">
          {SITE_LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-md px-2 py-2.5 text-sm text-fg-2 hover:bg-surface-2">
              {l.label}
            </Link>
          ))}
          <Link href="/app" className="mt-2 block rounded-md bg-fg px-3 py-2.5 text-center text-sm font-medium text-white">
            Open app
          </Link>
        </nav>
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

const MOBILE_NAV = [
  { href: "/app", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/app/trade/btc", label: "Trade", icon: CandlestickChart },
  { href: "/app/risk", label: "Risk", icon: Gauge },
  { href: "/app/claims", label: "Claims", icon: Wallet },
  { href: "/app/desk", label: "Desk", icon: Layers },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const active = (href: string, exact?: boolean) =>
    exact ? path === href : path === href || path.startsWith(href.replace(/\/btc$/, ""));
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex min-h-0 flex-1">
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line bg-surface lg:flex">
          <Link href="/" className="flex h-14 items-center border-b border-line px-4 text-fg" aria-label="Imprest home">
            <Logo />
          </Link>
          <nav aria-label="App" className="flex flex-1 flex-col gap-0.5 p-2">
            {APP_NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active(n.href, n.exact) ? "page" : undefined}
                className={cx(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm",
                  active(n.href, n.exact) ? "bg-surface-3 font-medium text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
                )}
              >
                <n.icon size={15} aria-hidden />
                {n.label}
              </Link>
            ))}
            <div className="my-2 border-t border-line" />
            {SECONDARY.map((n) => (
              <Link key={n.href} href={n.href} className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg">
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
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-fg lg:hidden" aria-label="Imprest home">
                <Logo />
              </Link>
              <span className="hidden md:block"><NetworkPill /></span>
            </div>
            <AccountButton />
          </header>
          <div className="flex justify-center border-b border-line bg-surface py-1 md:hidden">
            <NetworkPill />
          </div>
          <main id="main" className="min-w-0 flex-1 px-3 pt-4 pb-24 sm:px-5 lg:pb-8">
            {children}
          </main>
        </div>
      </div>
      <nav aria-label="App mobile" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
        {MOBILE_NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active(n.href, n.exact) ? "page" : undefined}
            className={cx("flex flex-col items-center gap-0.5 py-2 text-[10px]", active(n.href, n.exact) ? "text-accent" : "text-muted")}
          >
            <n.icon size={18} aria-hidden />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
