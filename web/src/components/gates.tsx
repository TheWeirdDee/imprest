"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Fingerprint, PackageOpen, ServerOff } from "lucide-react";
import { useAccount } from "@/lib/account/AccountProvider";
import { useDesk } from "@/lib/desk-context";
import { deployed, network } from "@/lib/env";
import { Button, Card, Notice, Pending, Skeleton } from "./ui";

/** Shown wherever Imprest contracts are required but no deployment receipt exists yet. */
export function NotDeployed() {
  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <ServerOff size={20} aria-hidden className="mt-0.5 shrink-0 text-warn" />
        <div className="text-sm">
          <div className="flex flex-wrap items-center gap-2 font-semibold">
            Imprest contracts are not deployed on {network.label} yet <Pending />
          </div>
          <p className="mt-1.5 leading-relaxed text-fg-2">
            The desk, pool and factory are built and tested against Perpl&apos;s own exchange bytecode and a fork of live testnet.
            Broadcasting them needs a funded testnet deployer key, which is an owner action. Market data below is live from Perpl{" "}
            {network.label.toLowerCase()}; desk actions unlock once{" "}
            <code className="num">config/networks.json</code> records the deployment.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <Link href="/proof" className="text-accent underline">See what is already proven</Link>
            <Link href="/docs/TESTNET_DEPLOYMENT.md" className="text-accent underline">Deployment runbook</Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function SignInPrompt({ reason }: { reason: string }) {
  const a = useAccount();
  return (
    <Card>
      <div className="flex flex-col items-start gap-3 sm:flex-row">
        <Fingerprint size={20} aria-hidden className="mt-0.5 shrink-0 text-accent" />
        <div className="min-w-0 text-sm">
          <div className="font-semibold">Sign in with a passkey</div>
          <p className="mt-1 text-fg-2">
            {reason} Your account is derived from a passkey with Mera: no seed phrase, no extension, no custody service.
          </p>
          {a.error && (
            <div className="mt-3">
              <Notice tone="warn" title={a.error.code}>
                {a.error.message}
              </Notice>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void a.createAccount()} disabled={a.status === "connecting"}>
              Create passkey account
            </Button>
            <Button variant="secondary" onClick={() => void a.signIn()} disabled={a.status === "connecting"}>
              I already have one
            </Button>
          </div>
          {a.prfSupport === "unsupported" && (
            <p className="mt-2 text-xs text-warn">This browser reports no WebAuthn PRF support (PRF_UNAVAILABLE).</p>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Renders children only when there is a deployed desk for the signed-in trader. */
export function RequireDesk({ children, what }: { children: ReactNode; what: string }) {
  const a = useAccount();
  const d = useDesk();
  if (!deployed) return <NotDeployed />;
  if (a.status !== "ready") return <SignInPrompt reason={`Sign in to see ${what}.`} />;
  if (d.deskLoading && !d.desk) return <Skeleton className="h-40 w-full" />;
  if (!d.desk) {
    return (
      <Card>
        <div className="flex items-start gap-3 text-sm">
          <PackageOpen size={20} aria-hidden className="mt-0.5 shrink-0 text-muted" />
          <div>
            <div className="font-semibold">No desk yet</div>
            <p className="mt-1 text-fg-2">Open an evaluation desk to see {what}.</p>
            <Link href="/app/desk" className="mt-2 inline-block text-accent underline">Open a desk</Link>
          </div>
        </div>
      </Card>
    );
  }
  return <>{children}</>;
}
