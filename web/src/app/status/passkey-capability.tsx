"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";

/** Reports this browser's WebAuthn PRF support without prompting. */
export function PasskeyCapability() {
  const [s, set] = useState<{ state: "up" | "down" | "unknown"; detail: string }>({ state: "unknown", detail: "checking…" });
  useEffect(() => {
    (async () => {
      if (typeof window === "undefined" || !window.PublicKeyCredential) {
        set({ state: "down", detail: "WebAuthn is not available in this browser" });
        return;
      }
      try {
        const caps = await (window.PublicKeyCredential as any).getClientCapabilities?.();
        if (caps && typeof caps["extension:prf"] === "boolean") {
          set(caps["extension:prf"] ? { state: "up", detail: "browser reports the PRF extension" } : { state: "down", detail: "PRF_UNAVAILABLE: browser reports no PRF extension" });
        } else {
          set({ state: "unknown", detail: "browser does not report capabilities; PRF is confirmed at passkey creation" });
        }
      } catch {
        set({ state: "unknown", detail: "capability query failed; PRF is confirmed at passkey creation" });
      }
    })();
  }, []);
  return (
    <li className="flex gap-3 border-t border-line px-4 py-3">
      {s.state === "up" ? (
        <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-safe" aria-label="up" />
      ) : s.state === "down" ? (
        <XCircle size={17} className="mt-0.5 shrink-0 text-breach" aria-label="down" />
      ) : (
        <CircleDashed size={17} className="mt-0.5 shrink-0 text-muted" aria-label="unknown" />
      )}
      <div className="min-w-0">
        <div className="text-sm font-medium">Mera passkey (this browser)</div>
        <div className="mt-0.5 text-xs text-muted">{s.detail}</div>
      </div>
    </li>
  );
}
