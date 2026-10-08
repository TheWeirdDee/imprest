import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, ExternalLink, FileJson } from "lucide-react";
import { explorerTx, type Claim } from "@imprest/core";
import { SiteHeader } from "@/components/shell";
import { LiveDeskPanel } from "@/components/live-panel";
import { AddressLink, EvidenceBadge, Pending } from "@/components/ui";
import { getClaims } from "@/lib/proof";
import { network } from "@/lib/env";

const RULES = [
  ["Market", "BTC and ETH perps only (allowlisted per cohort)", "Desk contract"],
  ["Order type", "Immediate-or-cancel or fill-or-kill; nothing rests on the book", "Desk stamp"],
  ["Leverage", "At most 5.00x per order", "Desk contract"],
  ["Price", "Limit within 50 bps of mark, closes included", "Desk contract"],
  ["Loss per fill", "50 bps negative-PnL cap stamped into the order", "Perpl"],
  ["Risk floor", "6% below tier start equity, re-checked after the fill", "Desk contract (atomic)"],
  ["Daily loss", "3% below equity at the first trade of the UTC day", "Desk contract"],
  ["Exposure", "Gross notional per market and per desk under pool caps", "Pool contract"],
  ["Credit fee", "Accrues only while a position is open; capped at 25% of stake", "Desk contract"],
  ["Payout", "Flat desks only; realized profit above the high-water mark", "Desk contract"],
];

function EvidenceRow({ c }: { c: Claim | undefined }) {
  if (!c) return null;
  const url = c.transaction_hash ? explorerTx(network, c.transaction_hash) : null;
  return (
    <tr className="border-t border-line align-top">
      <td className="py-2.5 pr-4 text-sm text-fg">{c.statement}</td>
      <td className="num py-2.5 pr-4 text-sm whitespace-nowrap">{c.value === null ? <Pending /> : String(c.value).slice(0, 28)}</td>
      <td className="py-2.5 pr-4">{c.value === null ? <span className="text-xs text-muted">—</span> : <EvidenceBadge status={c.status} />}</td>
      <td className="py-2.5 text-xs whitespace-nowrap">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="num inline-flex items-center gap-1 text-accent hover:underline">
            {c.transaction_hash!.slice(0, 10)}… <ExternalLink size={11} aria-hidden />
          </a>
        ) : c.evidence[0] ? (
          <span className="num inline-flex items-center gap-1 text-muted">
            <FileJson size={11} aria-hidden /> file
          </span>
        ) : (
          <span className="text-muted">pending</span>
        )}
      </td>
    </tr>
  );
}

export default function Landing() {
  const C = getClaims();
  const status: [string, boolean][] = [
    ["Contracts deployed on Monad testnet", C.TESTNET_DEPLOYMENT_DESKFACTORY?.status === "TESTNET_VERIFIED"],
    ["Deployed bytecode matches the build", C.TESTNET_DEPLOYMENT_IMPRESTPOOL?.status === "TESTNET_VERIFIED"],
    ["Over-limit order rejected by the contract", C.TESTNET_CANONICAL_GUARDED_REJECTION?.status === "TESTNET_VERIFIED"],
    ["Settlement paid by contract, verified on a second RPC", C.TESTNET_CANONICAL_CLOSE_PAYOUT?.status === "TESTNET_VERIFIED"],
    ["Graduation on testnet", C.TESTNET_CANONICAL_GRADUATION?.status === "TESTNET_VERIFIED"],
    ["Mainnet deployment", false],
  ];
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main">
        <section id="product" className="mx-auto grid max-w-6xl scroll-mt-20 gap-10 px-4 pt-12 pb-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:pt-16">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-accent">Funded trading desks on Perpl</p>
            <h1 className="mt-3 text-[2rem] leading-[1.15] font-semibold tracking-[-0.02em] sm:text-[2.6rem]">
              Trading credit with risk enforced at the order layer.
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-fg-2">
              Imprest turns verified trading history into use-restricted trading credit, with risk rules enforced inside every
              order and settlement handled by contracts.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link href="/app" className="inline-flex items-center gap-2 rounded-md bg-fg px-4 py-2.5 text-sm font-medium text-white hover:bg-fg-2">
                Open testnet app <ArrowRight size={15} aria-hidden />
              </Link>
              <Link href="/proof" className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-surface px-4 py-2.5 text-sm font-medium hover:bg-surface-2">
                View verification
              </Link>
            </div>
            <ul className="mt-8 grid gap-1.5 text-[13px]" aria-label="Protocol status">
              {status.map(([label, ok]) => (
                <li key={label} className="flex items-center gap-2">
                  {ok ? <CheckCircle2 size={14} aria-hidden className="shrink-0 text-safe" /> : <Circle size={14} aria-hidden className="shrink-0 text-muted" />}
                  <span className={ok ? "text-fg" : "text-muted"}>{label}</span>
                  <span className="sr-only">{ok ? "verified" : "pending"}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0">
            <LiveDeskPanel />
          </div>
        </section>

        <section id="how" className="scroll-mt-16 border-y border-line bg-surface">
          <div className="mx-auto grid max-w-6xl gap-px px-4 md:grid-cols-3">
            {[
              ["01", "Your trading history determines eligibility.", "A desk starts on your own stake. Profit target, closed trades and time are checked by the contract, not reviewed by a person."],
              ["02", "The desk determines what capital you can use.", "Graduation adds pool credit to your desk's own Perpl account. You can trade it; you can never withdraw it."],
              ["03", "The contract determines what orders are allowed.", "Every order is checked and stamped before it reaches Perpl. If equity would end below the floor, the whole transaction reverts."],
            ].map(([n, t, b]) => (
              <div key={n} className="py-8 md:px-6 md:first:pl-0 md:last:pr-0">
                <div className="num text-xs text-muted">{n}</div>
                <h2 className="mt-2 text-[15px] font-semibold">{t}</h2>
                <p className="mt-2 text-sm leading-relaxed text-fg-2">{b}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="risk" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Risk rules, enforced at the order layer</h2>
              <p className="mt-1 text-sm text-fg-2">The same rules run for every desk. No rule depends on the app or on a reviewer.</p>
            </div>
            <Link href="/docs/SECURITY.md" className="text-sm font-medium text-accent hover:underline">Security model</Link>
          </div>
          <div className="mt-5 overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
            <table className="w-full min-w-[620px] text-sm">
              <caption className="sr-only">Per-order risk rules</caption>
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Rule</th>
                  <th scope="col" className="px-4 py-2 font-medium">Limit</th>
                  <th scope="col" className="px-4 py-2 font-medium">Enforced by</th>
                </tr>
              </thead>
              <tbody>
                {RULES.map(([r, l, e]) => (
                  <tr key={r} className="border-t border-line">
                    <td className="px-4 py-2.5 font-medium">{r}</td>
                    <td className="px-4 py-2.5 text-fg-2">{l}</td>
                    <td className="px-4 py-2.5 text-fg-2">{e}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">Labeled demo cohort on testnet: graduation at +2% after two closed trades. Standard cohort: +8%, five trades, 24 hours.</p>
        </section>

        <section className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Verification</h2>
                <p className="mt-1 text-sm text-fg-2">Each line is generated from a receipt or test file. Unmeasured results say pending.</p>
              </div>
              <Link href="/proof" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                All evidence <ArrowRight size={14} aria-hidden />
              </Link>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <caption className="sr-only">Evidence</caption>
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th scope="col" className="pb-2 font-medium">Claim</th>
                    <th scope="col" className="pb-2 font-medium">Result</th>
                    <th scope="col" className="pb-2 font-medium">Status</th>
                    <th scope="col" className="pb-2 font-medium">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  <EvidenceRow c={C.TESTNET_CANONICAL_GUARDED_REJECTION} />
                  <EvidenceRow c={C.TESTNET_CANONICAL_CLOSE_PAYOUT} />
                  <EvidenceRow c={C.TESTNET_DEPLOYMENT_DESKFACTORY} />
                  <EvidenceRow c={C.LOCAL_CONTRACT_SUITE} />
                  <EvidenceRow c={C.REFERENCE_MODEL_AGREEMENT} />
                  <EvidenceRow c={C.TESTNET_CANONICAL_GRADUATION} />
                  <EvidenceRow c={C.TESTNET_CANONICAL_CLAIM_PAID} />
                  <EvidenceRow c={C.REPLAY_ATOMIC_VS_KEEPER_OVERSHOOT} />
                  <EvidenceRow c={C.MAINNET_AUSD_PAID_BY_CONTRACT} />
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 py-12 md:grid-cols-3">
          <div>
            <h3 className="text-sm font-semibold">Contracts</h3>
            <dl className="mt-2 space-y-1 text-[13px]">
              <div className="flex justify-between gap-2"><dt className="text-muted">ImprestPool</dt><dd>{network.imprest.pool ? <AddressLink address={network.imprest.pool} /> : "pending"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted">DeskFactory</dt><dd>{network.imprest.factory ? <AddressLink address={network.imprest.factory} /> : "pending"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted">Perpl exchange</dt><dd>{network.perpl.exchange ? <AddressLink address={network.perpl.exchange} /> : "—"}</dd></div>
            </dl>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Reproduce</h3>
            <p className="mt-2 text-[13px] text-fg-2">The full contract suite runs against Perpl&apos;s own exchange bytecode:</p>
            <code className="num mt-2 block rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs">pnpm proof:local</code>
          </div>
          <div>
            <h3 className="text-sm font-semibold">Limitations</h3>
            <p className="mt-2 text-[13px] text-fg-2">
              Testnet only. No audit. Graduation and profit claims wait for genuine market results.{" "}
              <Link href="/docs/KNOWN_LIMITATIONS.md" className="text-accent hover:underline">Full list</Link>
            </p>
          </div>
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-xs text-muted">
          <span>Imprest · MIT · Monad, Perpl, Agora AUSD, Mera</span>
          <nav aria-label="Footer" className="flex flex-wrap gap-4">
            <Link href="/docs/SECURITY.md" className="hover:text-fg">Security</Link>
            <Link href="/docs/KNOWN_LIMITATIONS.md" className="hover:text-fg">Limitations</Link>
            <Link href="/docs/EVIDENCE_STANDARD.md" className="hover:text-fg">Evidence standard</Link>
            <Link href="/status" className="hover:text-fg">Status</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
