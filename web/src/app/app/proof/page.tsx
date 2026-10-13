"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { STATE_LABEL } from "@imprest/core";
import { loadLocalReceipts, reconcilePending, type LocalReceipt } from "@/lib/tx";
import { Button, Card, EmptyState, Pill, TxLink } from "@/components/ui";

const label = (st: LocalReceipt["state"]) => (st === "mined" ? "Mined (found later)" : STATE_LABEL[st]);

/** The trader's own action receipts from this browser, each with its independent readback. */
export default function MyReceipts() {
  const [rows, setRows] = useState<LocalReceipt[]>([]);
  const [checking, setChecking] = useState(false);
  // Transactions whose outcome the page lost (timeout, reload) are looked up again on the chain.
  const check = async () => {
    setChecking(true);
    try {
      await reconcilePending();
    } finally {
      setRows(loadLocalReceipts());
      setChecking(false);
    }
  };
  useEffect(() => {
    setRows(loadLocalReceipts());
    void check();
  }, []);
  const open = rows.filter((r) => (r.state === "submitted" || r.state === "unknown") && !r.dropped).length;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <Receipt size={20} aria-hidden className="text-accent" /> My receipts
      </h1>
      <p className="text-sm text-fg-2">
        Every action you took from this browser, with the state it reached. Verified means a second, independent RPC read back the
        expected result at the same block. These receipts live in this browser only; the canonical evidence is on the{" "}
        <Link href="/proof" className="text-accent underline">proof page</Link>.
      </p>
      {open > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warn/40 bg-warn-bg p-3 text-sm">
          <span>
            {open} transaction{open === 1 ? " is" : "s are"} submitted but not yet confirmed. Do not send {open === 1 ? "it" : "them"} again; new
            transactions are held until this resolves.
          </span>
          <Button variant="secondary" onClick={check} disabled={checking}>
            {checking ? "Checking…" : "Check again"}
          </Button>
        </div>
      )}
      <Card pad={false}>
        {rows.length === 0 ? (
          <EmptyState title="No receipts yet" />
        ) : (
          <ul>
            {rows.map((r) => (
              <li key={r.id} className="border-t border-line px-4 py-3 first:border-t-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">{r.label}</div>
                  <Pill tone={r.state === "verified" ? "safe" : r.state === "verification_failed" || r.state === "failed" ? "breach" : r.state === "unknown" || r.state === "submitted" ? "warn" : "info"}>
                    {label(r.state)}
                  </Pill>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted">
                  <span>{r.network}</span>
                  <span className="num">{r.blockNumber ? `block ${r.blockNumber}` : "no block yet"}</span>
                  <TxLink hash={r.txHash} />
                  <span>{new Date(r.at).toLocaleString()}</span>
                </div>
                {r.reason && <div className="mt-1 text-xs text-fg-2">{r.reason}</div>}
                {r.readback && (
                  <details className="mt-1 text-xs text-muted">
                    <summary className="cursor-pointer">Readback on {r.readback.rpc}</summary>
                    <pre className="num mt-1 overflow-x-auto rounded bg-surface-2 p-2">{JSON.stringify({ expected: r.readback.expected, observed: r.readback.observed }, null, 2)}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
