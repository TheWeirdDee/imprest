"use client";

import { useEffect, useRef, useState } from "react";
import { Fingerprint, KeyRound, Lock, LogOut, TriangleAlert, Unlock, UserRound } from "lucide-react";
import { hasAccount, useAccount } from "@/lib/account/AccountProvider";
import { buttonClass, cx } from "./ui";

export function AccountButton() {
  const a = useAccount();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Still reading the remembered account: hold the space, never flash "Sign in".
  if (!a.ready) return <div aria-hidden className="h-8 w-24 animate-pulse rounded-[var(--radius-sm)] bg-surface-3" />;

  if (hasAccount(a) && a.address) {
    const locked = a.status !== "ready";
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`Account ${a.address}${locked ? ", signing locked" : ""}`}
          className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-line-strong bg-surface px-2.5 py-1.5 text-sm hover:bg-surface-2"
        >
          {a.kind === "dev-mock" ? (
            <span className="rounded bg-breach-bg px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-breach">DEV MOCK</span>
          ) : locked ? (
            <Lock size={14} aria-hidden className="text-muted" />
          ) : (
            <Fingerprint size={15} aria-hidden className="text-accent" />
          )}
          <span className="num">{`${a.address.slice(0, 6)}…${a.address.slice(-4)}`}</span>
        </button>
        {open && (
          <div role="menu" className="absolute right-0 z-50 mt-1 w-[min(18rem,calc(100vw-1.5rem))] rounded-[var(--radius-md)] border border-line bg-surface p-2 shadow-xl">
            <div className="px-2 py-1.5 text-xs leading-relaxed text-muted">
              {a.kind === "dev-mock"
                ? "Development mock key generated in this tab. Not a real account."
                : locked
                  ? "Signed in. Signing is locked: your passkey is asked once when you next send a transaction. The private key is never stored."
                  : "Signed in, signing unlocked. The key lives only in this tab's memory and locks after 30 idle minutes."}
            </div>
            <div className="num px-2 pb-2 text-xs break-all text-fg-2">{a.address}</div>
            {a.error && (
              <div className="mx-2 mb-2 flex items-start gap-1.5 text-xs text-warn">
                <TriangleAlert size={13} aria-hidden className="mt-0.5 shrink-0" /> {a.error.message}
              </div>
            )}
            {a.kind === "mera" &&
              (locked ? (
                <button
                  role="menuitem"
                  disabled={a.status === "connecting"}
                  onClick={() => {
                    void a.getSigner().catch(() => undefined);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-fg hover:bg-surface-2 disabled:opacity-50"
                >
                  <Unlock size={14} aria-hidden /> {a.status === "connecting" ? "Waiting for passkey…" : "Unlock signing now"}
                </button>
              ) : (
                <button
                  role="menuitem"
                  onClick={() => {
                    a.lock();
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-fg-2 hover:bg-surface-2"
                >
                  <Lock size={14} aria-hidden /> Lock signing
                </button>
              ))}
            <button
              role="menuitem"
              onClick={() => {
                a.signOut();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-fg-2 hover:bg-surface-2"
            >
              <LogOut size={14} aria-hidden /> Sign out on this device
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {a.error && (
        <span className="hidden max-w-[260px] items-center gap-1 truncate text-xs text-warn md:flex" title={a.error.message}>
          <TriangleAlert size={13} aria-hidden /> {a.error.code}
        </span>
      )}
      <button onClick={() => void a.signIn()} disabled={a.status === "connecting"} className={buttonClass("secondary", "sm")}>
        <KeyRound size={14} aria-hidden /> {a.status === "connecting" ? "Waiting…" : "Sign in"}
      </button>
      <button onClick={() => void a.createAccount()} disabled={a.status === "connecting"} className={buttonClass("primary", "sm", "hidden md:inline-flex")}>
        <UserRound size={14} aria-hidden /> Create passkey
      </button>
      {a.devMockAllowed && (
        <button onClick={a.useDevMock} className="rounded-[var(--radius-sm)] border border-breach/50 px-2 py-1.5 text-[11px] font-bold text-breach">
          DEV MOCK
        </button>
      )}
    </div>
  );
}
