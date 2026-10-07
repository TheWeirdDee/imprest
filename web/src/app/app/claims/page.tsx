"use client";

import { Lock, Wallet } from "lucide-react";
import { accounting } from "@imprest/core";
import { useAccount } from "@/lib/account/AccountProvider";
import { useDesk } from "@/lib/desk-context";
import { claimAction, closeAction } from "@/lib/actions";
import { useAction } from "@/lib/tx";
import { ausd, signedAusd } from "@/lib/format";
import { summarize } from "@/lib/summary";
import { Button, Card, KV, Notice } from "@/components/ui";
import { RequireDesk } from "@/components/gates";
import { TxStatus } from "@/components/tx-status";

export default function ClaimsPage() {
  const a = useAccount();
  const d = useDesk();
  const claim = useAction();
  const close = useAction();
  const r = d.risk.data;
  const p = d.policy.data;
  const s = r ? summarize(r, p, d.positions.data) : null;
  const t = r && p ? p.tiers[r.tier] : null;
  const split = r && t ? accounting.claimSplit(r.equity, r.hwm, r.feeOutstanding, BigInt(t.traderSplitBps), BigInt(t.protocolSplitBps)) : null;
  const busy = (x: { state: { kind: string } }) => ["requested", "submitted", "confirming"].includes(x.state.kind);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <Wallet size={20} aria-hidden className="text-accent" /> Claims and payout
      </h1>
      <RequireDesk what="claims">
        {r && p && s && t && split && (
          <>
            {!r.flat && (
              <Notice tone="warn" title="CLAIM BLOCKED">
                Close all positions before claiming. Unrealized profit cannot be claimed: the contract only pays realized equity on a flat desk.
              </Notice>
            )}
            {r.flat && s.unrealized === 0n && split.gross === 0n && (
              <Notice tone="info" title="Nothing to claim">
                Realized equity is not above the high-water mark.
              </Notice>
            )}

            <Card title="If you claim now">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <KV k="Realized equity" v={ausd(r.equity - s.unrealized)} />
                  <KV k="High-water mark" v={ausd(r.hwm)} />
                  <KV k="Realized profit above HWM" v={ausd(split.gross)} />
                  <KV k="Accrued credit fees, netted first" v={`-${ausd(split.feesPaid, 4)}`} />
                  <KV k="Eligible profit" v={ausd(split.gross - split.feesPaid)} />
                  {s.unrealized !== 0n && <KV k="Unrealized (not claimable)" v={signedAusd(s.unrealized)} />}
                </div>
                <div>
                  <KV k={`Your share (${t.traderSplitBps / 100}%)`} v={<span className="text-safe">{ausd(split.traderShare)}</span>} />
                  <KV k={`Pool share (${(10_000 - t.traderSplitBps - t.protocolSplitBps) / 100}%)`} v={ausd(split.poolShare)} />
                  <KV k={`Protocol share (${t.protocolSplitBps / 100}%)`} v={ausd(split.protocolShare)} />
                  <p className="mt-2 text-[11px] leading-relaxed text-muted">
                    Computed here with the same rules as the contract, then checked after the claim against your wallet balance on an
                    independent RPC. After a claim, equity returns to the high-water mark, so the same profit cannot be claimed twice.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  disabled={!a.account || !r.flat || split.gross === 0n || r.status !== 0 || busy(claim)}
                  onClick={async () => {
                    await claim.run(claimAction(a.account!, d.desk!, r, p));
                    d.refreshAll();
                  }}
                >
                  {!r.flat && <Lock size={14} aria-hidden />} Claim realized profit
                </Button>
              </div>
              <div className="mt-3">
                <TxStatus state={claim.state} onReset={claim.reset} />
              </div>
            </Card>

            <Card title="Close the desk">
              <p className="text-sm text-fg-2">
                A flat desk can be closed at any time. Profit above the high-water mark is split once, borrowed principal is repaid,
                outstanding fees are collected or written off, and the rest returns to you. Voluntary close pays no keeper bounty.
              </p>
              {(() => {
                const eqAfter = r.equity - split.gross;
                const w = accounting.waterfall(eqAfter, r.borrowed, r.feeOutstanding - split.feesPaid, 0n);
                return (
                  <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
                    <KV k="Principal repaid to pool" v={ausd(w.principalRepaid)} />
                    <KV k="Fees collected" v={ausd(w.feesCollected, 4)} />
                    <KV k="Fees written off" v={ausd(w.feesWrittenOff, 4)} />
                    <KV k="Returned to you" v={<span className="text-safe">{ausd(w.traderRemainder + split.traderShare)}</span>} />
                  </div>
                );
              })()}
              <Button
                variant="secondary"
                className="mt-3"
                disabled={!a.account || !r.flat || r.status !== 0 || busy(close)}
                onClick={async () => {
                  await close.run(closeAction(a.account!, d.desk!, r, p));
                  d.refreshAll();
                }}
              >
                Close desk
              </Button>
              <div className="mt-3">
                <TxStatus state={close.state} onReset={close.reset} />
              </div>
            </Card>
          </>
        )}
      </RequireDesk>
    </div>
  );
}
