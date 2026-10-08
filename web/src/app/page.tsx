import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleDashed } from "lucide-react";
import { SiteHeader } from "@/components/shell";
import { LiveDeskPanel } from "@/components/live-panel";
import { AddressLink, buttonClass } from "@/components/ui";
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

export default function Landing() {
  const C = getClaims();
  const v = (id: string) => C[id]?.status === "TESTNET_VERIFIED";
  const verified: [string, boolean][] = [
    ["Contracts deployed", v("TESTNET_DEPLOYMENT_DESKFACTORY") && v("TESTNET_DEPLOYMENT_IMPRESTPOOL")],
    ["Bytecode matches the build", v("TESTNET_DEPLOYMENT_DESKFACTORY")],
    ["Contract-level risk rejection", v("TESTNET_CANONICAL_GUARDED_REJECTION")],
    ["Real Perpl trades", v("TESTNET_CANONICAL_CLOSE_PAYOUT")],
    ["Contract settlement", v("TESTNET_CANONICAL_CLOSE_PAYOUT")],
    ["Independent RPC verification", v("TESTNET_CANONICAL_CLOSE_PAYOUT")],
    ["Gasless relayed trades", v("TESTNET_RELAYED_TRADE")],
    ["Earned graduation, keeper-executed", v("TESTNET_CANONICAL_GRADUATION") && v("TESTNET_KEEPER_ACTION")],
  ];
  const pending = [
    !v("TESTNET_CANONICAL_CLAIM_PAID") && "profit claim (needs genuine profit)",
    "mainnet",
    "independent security audit",
  ].filter(Boolean) as string[];

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main">
        {/* Hero: what Imprest is, why it matters, what you can do. The product sits next to it. */}
        <section id="product" className="mx-auto grid max-w-6xl scroll-mt-20 gap-10 px-4 pt-10 pb-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:pt-16">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-accent">Funded trading desks on Perpl</p>
            <h1 className="mt-3 text-[2rem] leading-[1.15] font-semibold tracking-[-0.02em] sm:text-[2.6rem]">
              Trading credit with risk enforced at the order layer.
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-fg-2">
              Imprest turns verified trading history into use-restricted trading credit. Risk rules are enforced inside every order, with
              settlement handled by contracts.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link href="/app" className={buttonClass("primary", "lg")}>
                Open app <ArrowRight size={15} aria-hidden />
              </Link>
              <Link href="/#how" className={buttonClass("secondary", "lg")}>
                See how it works
              </Link>
            </div>
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

        {/* Proof lives below the hero, compact; the full evidence table is on /proof. */}
        <section aria-labelledby="verified" className="mx-auto max-w-6xl px-4 py-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="verified" className="text-xl font-semibold tracking-tight">
                Verified on Monad testnet
              </h2>
              <p className="mt-1 text-sm text-fg-2">Every item is backed by a transaction receipt, read back on a second, independent RPC.</p>
            </div>
            <Link href="/proof" className={buttonClass("tertiary", "md")}>
              View proof <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
          <ul className="mt-5 grid gap-px overflow-hidden rounded-[var(--radius-md)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {verified.map(([label, ok]) => (
              <li key={label} className="flex items-center gap-2.5 bg-surface px-4 py-3 text-sm">
                {ok ? <CheckCircle2 size={16} aria-hidden className="shrink-0 text-safe" /> : <CircleDashed size={16} aria-hidden className="shrink-0 text-muted" />}
                <span className={ok ? "text-fg" : "text-muted"}>{label}</span>
                <span className="sr-only">{ok ? "verified" : "pending"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Not yet: {pending.join(", ")}.</p>
        </section>

        <section id="risk" className="scroll-mt-16 border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Risk rules, enforced at the order layer</h2>
                <p className="mt-1 text-sm text-fg-2">The same rules run for every desk. No rule depends on the app or on a reviewer.</p>
              </div>
              <Link href="/docs/SECURITY.md" className={buttonClass("tertiary", "md")}>
                Security model
              </Link>
            </div>
            {/* Phones: stacked cards. Tablet and up: a table. Nothing is hidden at any width. */}
            <ul className="mt-5 grid gap-2 md:hidden">
              {RULES.map(([r, l, e]) => (
                <li key={r} className="rounded-[var(--radius-md)] border border-line bg-bg px-3.5 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold">{r}</span>
                    <span className="text-right text-xs text-muted">{e}</span>
                  </div>
                  <p className="mt-1 text-sm text-fg-2">{l}</p>
                </li>
              ))}
            </ul>
            <div className="mt-5 hidden overflow-hidden rounded-[var(--radius-md)] border border-line md:block">
              <table className="w-full text-sm">
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
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Contracts</h3>
              <dl className="mt-2 space-y-1 text-[13px]">
                <div className="flex justify-between gap-2"><dt className="text-muted">ImprestPool</dt><dd>{network.imprest.pool ? <AddressLink address={network.imprest.pool} /> : "pending"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted">DeskFactory</dt><dd>{network.imprest.factory ? <AddressLink address={network.imprest.factory} /> : "pending"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted">Perpl exchange</dt><dd>{network.perpl.exchange ? <AddressLink address={network.perpl.exchange} /> : "—"}</dd></div>
              </dl>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Reproduce</h3>
              <p className="mt-2 text-[13px] text-fg-2">The full contract suite runs against Perpl&apos;s own exchange bytecode:</p>
              <code className="num mt-2 block rounded-[var(--radius-sm)] border border-line bg-surface px-2.5 py-1.5 text-xs">pnpm proof:local</code>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Limitations</h3>
              <p className="mt-2 text-[13px] text-fg-2">
                Testnet only. No independent audit. Profit claims wait for genuine market results.{" "}
                <Link href="/docs/KNOWN_LIMITATIONS.md" className="text-accent hover:underline">
                  Full list
                </Link>
              </p>
            </div>
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
