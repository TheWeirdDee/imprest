import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { LocalAccount } from "viem";
import { deriveEvmKey } from "@imprest/core";
import { network, passkeyRpId } from "./chain";

interface AccountState {
  status: "signed-out" | "connecting" | "ready" | "error";
  address: `0x${string}` | null;
  account: LocalAccount | null;
  error: { code: string; message: string } | null;
}

interface Ctx extends AccountState {
  createAccount: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => void;
}

const AccountCtx = createContext<Ctx | null>(null);

function meraError(e: unknown) {
  const code = (e as any)?.code ?? "PASSKEY_OPERATION_FAILED";
  const msg: Record<string, string> = {
    PRF_UNAVAILABLE: "This device's passkey provider does not support the PRF extension Mera needs (iOS 18+ with iCloud Keychain, or Android 9+ with Google Password Manager).",
    PASSKEY_OPERATION_FAILED: "The passkey request was cancelled or passkeys are not configured for this app's domain.",
  };
  return { code, message: msg[code] ?? String((e as Error)?.message ?? e) };
}

/**
 * Mera passkey account on React Native. Same derivation as the web app
 * (@imprest/core deriveEvmKey), so one passkey yields one Imprest account on both clients.
 * The session key lives in memory only.
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const [s, set] = useState<AccountState>({ status: "signed-out", address: null, account: null, error: null });
  const session = useRef<{ end: () => void } | null>(null);

  const start = useCallback(async (prf: Uint8Array) => {
    const mera = await import("@category-labs/mera");
    const { toViemAccount } = await import("@category-labs/mera/viem");
    const key = deriveEvmKey(prf);
    const sess = mera.createSecp256k1SigningSession({ privateKey: key });
    key.fill(0);
    prf.fill(0);
    session.current = sess;
    const account = toViemAccount(sess) as unknown as LocalAccount;
    set({ status: "ready", address: account.address, account, error: null });
  }, []);

  const run = useCallback(
    async (create: boolean) => {
      if (!passkeyRpId) {
        set((p) => ({ ...p, status: "error", error: { code: "RP_ID_NOT_CONFIGURED", message: "Set EXPO_PUBLIC_PASSKEY_RP_ID to the domain hosting the Imprest web app (associated domains required)." } }));
        return;
      }
      set((p) => ({ ...p, status: "connecting", error: null }));
      try {
        const mera = await import("@category-labs/mera");
        const { reactNativeWebAuthnClient } = await import("@category-labs/mera/react-native-webauthn-client");
        const r = create
          ? await mera.createPasskeyWithPrfOutput({
              rp: { id: passkeyRpId, name: "Imprest" },
              user: { name: `imprest-${network.environment}`, displayName: `Imprest (${network.label})` },
              webAuthnClient: reactNativeWebAuthnClient,
            })
          : await mera.getPasskeyPrfOutput({ rpId: passkeyRpId, webAuthnClient: reactNativeWebAuthnClient });
        await start(new Uint8Array(r.prfOutput));
      } catch (e) {
        set((p) => ({ ...p, status: "error", error: meraError(e) }));
      }
    },
    [start],
  );

  const signOut = useCallback(() => {
    try {
      session.current?.end();
    } catch {
      /* already ended */
    }
    session.current = null;
    set({ status: "signed-out", address: null, account: null, error: null });
  }, []);

  const value = useMemo(() => ({ ...s, createAccount: () => run(true), signIn: () => run(false), signOut }), [s, run, signOut]);
  return <AccountCtx.Provider value={value}>{children}</AccountCtx.Provider>;
}

export function useAccount(): Ctx {
  const v = useContext(AccountCtx);
  if (!v) throw new Error("useAccount outside AccountProvider");
  return v;
}
