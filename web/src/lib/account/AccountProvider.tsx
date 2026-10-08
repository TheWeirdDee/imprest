"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LocalAccount } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { devMockAllowed, network, passkeyRpId } from "../env";
import { deriveEvmKey } from "./derive";

export type AccountKind = "mera" | "dev-mock";

/**
 * Session model (single source of truth for every page):
 *  - initializing: before the remembered account is read; pages must NOT treat this as signed out.
 *  - signed-out:   no account remembered on this device.
 *  - locked:       the account is known (address remembered), so every read view works; the signing
 *                  key is not in memory. The next signature asks for the passkey once.
 *  - ready:        the signing key is in memory (derived from the passkey PRF; never persisted).
 *  - connecting:   a passkey prompt is open.   error: the last passkey operation failed.
 *
 * Persisted (localStorage): address, kind, credential id. These are public identifiers, not
 * secrets. The private key is never written anywhere; it lives in memory and is zeroed on lock.
 */
export type AccountStatus = "initializing" | "signed-out" | "locked" | "connecting" | "ready" | "error";

export interface AccountState {
  status: AccountStatus;
  kind: AccountKind | null;
  address: `0x${string}` | null;
  account: LocalAccount | null;
  error: { code: string; message: string } | null;
  prfSupport: "unknown" | "supported" | "unsupported";
}

interface Ctx extends AccountState {
  /** True once the remembered account has been read; before that, show loading, not sign-in. */
  ready: boolean;
  createAccount: () => Promise<void>;
  signIn: () => Promise<void>;
  /** Returns the signer, asking for the passkey first if the session is locked. */
  getSigner: () => Promise<LocalAccount>;
  /** Drops the signing key from memory but keeps the account (address) on this device. */
  lock: () => void;
  /** Forgets the account on this device. */
  signOut: () => void;
  useDevMock: () => void;
  devMockAllowed: boolean;
}

const AccountCtx = createContext<Ctx | null>(null);
const CRED_KEY = "imprest.passkey.credential.v1";
const ACCOUNT_KEY = `imprest.account.v1.${network.environment}`;
const IDLE_MS = 30 * 60 * 1000;

type Remembered = { address: `0x${string}`; kind: "mera" };

function rpId(): string {
  return passkeyRpId ?? window.location.hostname;
}

function readRemembered(): Remembered | null {
  try {
    const v = JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? "null");
    return v && typeof v.address === "string" && /^0x[0-9a-fA-F]{40}$/.test(v.address) ? { address: v.address, kind: "mera" } : null;
  } catch {
    return null;
  }
}

function remember(address: `0x${string}`) {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ address, kind: "mera" }));
  } catch {
    /* storage blocked: the session still works for this tab */
  }
}

function meraMessage(e: unknown): { code: string; message: string } {
  const code = (e as any)?.code ?? "PASSKEY_OPERATION_FAILED";
  const map: Record<string, string> = {
    PRF_UNAVAILABLE:
      "This browser or authenticator does not support the WebAuthn PRF extension, which Mera needs to derive your account. Try Chrome or Edge with Google Password Manager, or Safari with iCloud Keychain (iOS 18+ / macOS 15+).",
    PASSKEY_OPERATION_FAILED: "The passkey request was cancelled or WebAuthn is unavailable in this browser.",
    CRYPTO_UNAVAILABLE: "This browser lacks the Web Crypto features Mera needs.",
    ACCOUNT_MISMATCH: "That passkey belongs to a different Imprest account than the one remembered on this device. Sign out first to switch accounts.",
  };
  return { code, message: map[code] ?? String((e as Error)?.message ?? e) };
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<AccountState>({
    status: "initializing",
    kind: null,
    address: null,
    account: null,
    error: null,
    prfSupport: "unknown",
  });
  const sessionRef = useRef<{ end: () => void } | null>(null);
  const idleRef = useRef<number | null>(null);
  const pending = useRef<Promise<LocalAccount> | null>(null);

  // Restore the remembered account once, on the client. Until then status stays "initializing".
  useEffect(() => {
    const r = readRemembered();
    setS((p) => (p.status !== "initializing" ? p : r ? { ...p, status: "locked", kind: "mera", address: r.address } : { ...p, status: "signed-out" }));
    // Another tab signing out (or in) updates this tab too.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== ACCOUNT_KEY) return;
      const n = readRemembered();
      if (!n) {
        try {
          sessionRef.current?.end();
        } catch {
          /* ended */
        }
        sessionRef.current = null;
        setS((p) => ({ ...p, status: "signed-out", kind: null, address: null, account: null }));
      } else {
        setS((p) => (p.address?.toLowerCase() === n.address.toLowerCase() ? p : { ...p, status: "locked", kind: "mera", address: n.address, account: null }));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const endSession = () => {
    try {
      sessionRef.current?.end();
    } catch {
      /* already ended */
    }
    sessionRef.current = null;
  };

  const lock = useCallback(() => {
    endSession();
    setS((p) => (p.kind === "dev-mock" ? { ...p, status: "signed-out", kind: null, address: null, account: null } : p.address ? { ...p, status: "locked", account: null } : p));
  }, []);

  const signOut = useCallback(() => {
    endSession();
    try {
      localStorage.removeItem(ACCOUNT_KEY);
    } catch {
      /* ignore */
    }
    setS((p) => ({ ...p, status: "signed-out", kind: null, address: null, account: null, error: null }));
  }, []);

  // Idle: after 30 minutes without interaction the signing key is dropped (locked), the account stays.
  useEffect(() => {
    if (s.status !== "ready") return;
    const reset = () => {
      if (idleRef.current) window.clearTimeout(idleRef.current);
      idleRef.current = window.setTimeout(lock, IDLE_MS);
    };
    reset();
    const evs = ["pointerdown", "keydown"] as const;
    evs.forEach((e) => window.addEventListener(e, reset));
    return () => {
      evs.forEach((e) => window.removeEventListener(e, reset));
      if (idleRef.current) window.clearTimeout(idleRef.current);
    };
  }, [s.status, lock]);

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

  const startSession = useCallback(async (prfOutput: Uint8Array, expected: `0x${string}` | null): Promise<LocalAccount> => {
    const mera = await import("@category-labs/mera");
    const { toViemAccount } = await import("@category-labs/mera/viem");
    const privateKey = deriveEvmKey(prfOutput);
    const session = mera.createSecp256k1SigningSession({ privateKey });
    privateKey.fill(0);
    prfOutput.fill(0);
    const account = toViemAccount(session) as unknown as LocalAccount;
    if (expected && account.address.toLowerCase() !== expected.toLowerCase()) {
      session.end();
      throw Object.assign(new Error("account mismatch"), { code: "ACCOUNT_MISMATCH" });
    }
    endSession();
    sessionRef.current = session;
    remember(account.address);
    setS((p) => ({ ...p, status: "ready", kind: "mera", address: account.address, account, error: null, prfSupport: "supported" }));
    return account;
  }, []);

  const fail = (e: unknown) => {
    const err = meraMessage(e);
    // A failed or cancelled prompt never forgets a remembered account.
    setS((p) => ({ ...p, status: p.address ? "locked" : "error", error: err, prfSupport: err.code === "PRF_UNAVAILABLE" ? "unsupported" : p.prfSupport }));
    return err;
  };

  const createAccount = useCallback(async () => {
    setS((p) => ({ ...p, status: "connecting", error: null }));
    try {
      const mera = await import("@category-labs/mera");
      const r = await mera.createPasskeyWithPrfOutput({
        rp: { id: rpId(), name: "Imprest" },
        user: { name: `imprest-${network.environment}`, displayName: `Imprest (${network.label})` },
      });
      localStorage.setItem(CRED_KEY, JSON.stringify({ credentialId: r.credentialId, transports: (r as any).transports ?? [] }));
      await startSession(new Uint8Array(r.prfOutput), null);
    } catch (e) {
      fail(e);
    }
  }, [startSession]);

  const unlock = useCallback(
    async (expected: `0x${string}` | null): Promise<LocalAccount> => {
      setS((p) => ({ ...p, status: "connecting", error: null }));
      const mera = await import("@category-labs/mera");
      const saved = localStorage.getItem(CRED_KEY);
      const credential = saved ? (JSON.parse(saved) as { credentialId: string; transports?: string[] }) : undefined;
      const r = await mera.getPasskeyPrfOutput({ rpId: rpId(), credential: credential as any });
      localStorage.setItem(CRED_KEY, JSON.stringify({ credentialId: r.credentialId, transports: credential?.transports ?? [] }));
      return startSession(new Uint8Array(r.prfOutput), expected);
    },
    [startSession],
  );

  const signIn = useCallback(async () => {
    try {
      await unlock(null);
    } catch (e) {
      fail(e);
    }
  }, [unlock]);

  const stateRef = useRef(s);
  stateRef.current = s;
  const getSigner = useCallback(async (): Promise<LocalAccount> => {
    const cur = stateRef.current;
    if (cur.status === "ready" && cur.account) return cur.account;
    // One prompt even if several actions ask at once.
    pending.current ??= unlock(cur.address).finally(() => {
      pending.current = null;
    });
    try {
      return await pending.current;
    } catch (e) {
      const err = fail(e);
      throw Object.assign(new Error(err.message), { code: err.code });
    }
  }, [unlock]);

  /** DEVELOPMENT MOCK: local network only, explicit flag, visibly labeled, never in production. */
  const useDevMock = useCallback(() => {
    if (!devMockAllowed) return;
    const account = privateKeyToAccount(generatePrivateKey());
    setS((p) => ({ ...p, status: "ready", kind: "dev-mock", address: account.address, account, error: null }));
  }, []);

  const value = useMemo<Ctx>(
    () => ({ ...s, ready: s.status !== "initializing", createAccount, signIn, getSigner, lock, signOut, useDevMock, devMockAllowed }),
    [s, createAccount, signIn, getSigner, lock, signOut, useDevMock],
  );
  return <AccountCtx.Provider value={value}>{children}</AccountCtx.Provider>;
}

export function useAccount(): Ctx {
  const c = useContext(AccountCtx);
  if (!c) throw new Error("useAccount outside AccountProvider");
  return c;
}

/** Signed in for reading: the account is known (ready or locked, or a prompt is open for it). */
export function hasAccount(a: Pick<AccountState, "address" | "status">): boolean {
  return Boolean(a.address) && a.status !== "signed-out";
}
