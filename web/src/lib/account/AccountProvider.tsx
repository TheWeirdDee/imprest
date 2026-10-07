"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LocalAccount } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { devMockAllowed, network, passkeyRpId } from "../env";
import { deriveEvmKey } from "./derive";

export type AccountKind = "mera" | "dev-mock";

export interface AccountState {
  status: "signed-out" | "connecting" | "ready" | "error";
  kind: AccountKind | null;
  address: `0x${string}` | null;
  account: LocalAccount | null;
  error: { code: string; message: string } | null;
  prfSupport: "unknown" | "supported" | "unsupported";
}

interface Ctx extends AccountState {
  createAccount: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => void;
  useDevMock: () => void;
  devMockAllowed: boolean;
}

const AccountCtx = createContext<Ctx | null>(null);
const CRED_KEY = "imprest.passkey.credential.v1";
const IDLE_MS = 30 * 60 * 1000;

function rpId(): string {
  return passkeyRpId ?? window.location.hostname;
}

function meraMessage(e: unknown): { code: string; message: string } {
  const code = (e as any)?.code ?? "PASSKEY_OPERATION_FAILED";
  const map: Record<string, string> = {
    PRF_UNAVAILABLE:
      "This browser or authenticator does not support the WebAuthn PRF extension, which Mera needs to derive your account. Try Chrome or Edge with Google Password Manager, or Safari with iCloud Keychain (iOS 18+ / macOS 15+).",
    PASSKEY_OPERATION_FAILED: "The passkey request was cancelled or WebAuthn is unavailable in this browser.",
    CRYPTO_UNAVAILABLE: "This browser lacks the Web Crypto features Mera needs.",
    SESSION_ENDED: "Your signing session ended. Sign in again.",
  };
  return { code, message: map[code] ?? String((e as Error)?.message ?? e) };
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<AccountState>({
    status: "signed-out",
    kind: null,
    address: null,
    account: null,
    error: null,
    prfSupport: "unknown",
  });
  const sessionRef = useRef<{ end: () => void } | null>(null);
  const idleRef = useRef<number | null>(null);

  const signOut = useCallback(() => {
    try {
      sessionRef.current?.end();
    } catch {
      /* already ended */
    }
    sessionRef.current = null;
    setS((p) => ({ ...p, status: "signed-out", kind: null, address: null, account: null, error: null }));
  }, []);

  // Idle timeout: the session key is zeroed after 30 minutes without interaction.
  useEffect(() => {
    if (s.status !== "ready") return;
    const reset = () => {
      if (idleRef.current) window.clearTimeout(idleRef.current);
      idleRef.current = window.setTimeout(signOut, IDLE_MS);
    };
    reset();
    const evs = ["pointerdown", "keydown"] as const;
    evs.forEach((e) => window.addEventListener(e, reset));
    return () => {
      evs.forEach((e) => window.removeEventListener(e, reset));
      if (idleRef.current) window.clearTimeout(idleRef.current);
    };
  }, [s.status, signOut]);

  // Capability probe (no prompt).
  useEffect(() => {
    (async () => {
      try {
        const caps = await (window.PublicKeyCredential as any)?.getClientCapabilities?.();
        if (caps && typeof caps["extension:prf"] === "boolean") {
          setS((p) => ({ ...p, prfSupport: caps["extension:prf"] ? "supported" : "unsupported" }));
        }
      } catch {
        /* unknown */
      }
    })();
  }, []);

  const startSession = useCallback(async (prfOutput: Uint8Array) => {
    const mera = await import("@category-labs/mera");
    const { toViemAccount } = await import("@category-labs/mera/viem");
    const privateKey = deriveEvmKey(prfOutput);
    const session = mera.createSecp256k1SigningSession({ privateKey });
    privateKey.fill(0);
    prfOutput.fill(0);
    sessionRef.current = session;
    const account = toViemAccount(session) as unknown as LocalAccount;
    setS((p) => ({ ...p, status: "ready", kind: "mera", address: account.address, account, error: null, prfSupport: "supported" }));
  }, []);

  const createAccount = useCallback(async () => {
    setS((p) => ({ ...p, status: "connecting", error: null }));
    try {
      const mera = await import("@category-labs/mera");
      const r = await mera.createPasskeyWithPrfOutput({
        rp: { id: rpId(), name: "Imprest" },
        user: { name: `imprest-${network.environment}`, displayName: `Imprest (${network.label})` },
      });
      localStorage.setItem(CRED_KEY, JSON.stringify({ credentialId: r.credentialId, transports: (r as any).transports ?? [] }));
      await startSession(new Uint8Array(r.prfOutput));
    } catch (e) {
      const err = meraMessage(e);
      setS((p) => ({ ...p, status: "error", error: err, prfSupport: err.code === "PRF_UNAVAILABLE" ? "unsupported" : p.prfSupport }));
    }
  }, [startSession]);

  const signIn = useCallback(async () => {
    setS((p) => ({ ...p, status: "connecting", error: null }));
    try {
      const mera = await import("@category-labs/mera");
      const saved = localStorage.getItem(CRED_KEY);
      const credential = saved ? (JSON.parse(saved) as { credentialId: string; transports?: string[] }) : undefined;
      const r = await mera.getPasskeyPrfOutput({ rpId: rpId(), credential: credential as any });
      localStorage.setItem(CRED_KEY, JSON.stringify({ credentialId: r.credentialId, transports: credential?.transports ?? [] }));
      await startSession(new Uint8Array(r.prfOutput));
    } catch (e) {
      const err = meraMessage(e);
      setS((p) => ({ ...p, status: "error", error: err, prfSupport: err.code === "PRF_UNAVAILABLE" ? "unsupported" : p.prfSupport }));
    }
  }, [startSession]);

  /** DEVELOPMENT MOCK: local network only, explicit flag, visibly labeled, never in production. */
  const useDevMock = useCallback(() => {
    if (!devMockAllowed) return;
    const account = privateKeyToAccount(generatePrivateKey());
    setS((p) => ({ ...p, status: "ready", kind: "dev-mock", address: account.address, account, error: null }));
  }, []);

  const value = useMemo<Ctx>(
    () => ({ ...s, createAccount, signIn, signOut, useDevMock, devMockAllowed }),
    [s, createAccount, signIn, signOut, useDevMock],
  );
  return <AccountCtx.Provider value={value}>{children}</AccountCtx.Provider>;
}

export function useAccount(): Ctx {
  const c = useContext(AccountCtx);
  if (!c) throw new Error("useAccount outside AccountProvider");
  return c;
}
