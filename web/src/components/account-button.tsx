"use client";

import { useState } from "react";
import { Fingerprint, KeyRound, LogOut, TriangleAlert, UserRound } from "lucide-react";
import { useAccount } from "@/lib/account/AccountProvider";
import { cx } from "./ui";

export function AccountButton() {
  const a = useAccount();
  const [open, setOpen] = useState(false);

  if (a.status === "ready" && a.address) {
    return (
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex items-center gap-2 rounded-md border border-line-strong bg-surface-2 px-2.5 py-1.5 text-sm hover:bg-surface-3"
        >
          {a.kind === "dev-mock" ? (
            <span className="rounded bg-breach-bg px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-breach">DEVELOPMENT MOCK</span>
          ) : (
            <Fingerprint size={15} aria-hidden className="text-accent" />
          )}
          <span className="num">{`${a.address.slice(0, 6)}…${a.address.slice(-4)}`}</span>
        </button>
        {open && (
          <div role="menu" className="absolute right-0 z-40 mt-1 w-64 rounded-lg border border-line bg-surface-2 p-2 shadow-xl">
            <div className="px-2 py-1.5 text-xs text-muted">
              {a.kind === "mera" ? "Mera passkey account. The session key lives in memory and ends after 30 idle minutes." : "Development mock key generated in this tab. Not a real account."}
            </div>
            <div className="num px-2 pb-2 text-xs break-all text-fg-2">{a.address}</div>
            <button
              role="menuitem"
              onClick={() => {
                a.signOut();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-fg-2 hover:bg-surface-3"
            >
              <LogOut size={14} aria-hidden /> End session
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {a.error && (
        <span className="hidden max-w-[260px] items-center gap-1 truncate text-xs text-warn sm:flex" title={a.error.message}>
          <TriangleAlert size={13} aria-hidden /> {a.error.code}
        </span>
      )}
      <button
        onClick={() => void a.signIn()}
        disabled={a.status === "connecting"}
        className="flex items-center gap-1.5 rounded-md border border-line-strong bg-surface-2 px-2.5 py-1.5 text-sm text-fg hover:bg-surface-3 disabled:opacity-50"
      >
        <KeyRound size={14} aria-hidden /> {a.status === "connecting" ? "Waiting for passkey…" : "Sign in"}
      </button>
      <button
        onClick={() => void a.createAccount()}
        disabled={a.status === "connecting"}
        className={cx("hidden items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50 sm:flex")}
      >
        <UserRound size={14} aria-hidden /> Create passkey
      </button>
      {a.devMockAllowed && (
        <button onClick={a.useDevMock} className="rounded-md border border-breach/50 px-2 py-1.5 text-[11px] font-bold text-breach">
          DEVELOPMENT MOCK
        </button>
      )}
    </div>
  );
}
