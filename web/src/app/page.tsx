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
    ["Relayed trades (script-submitted)", v("TESTNET_RELAYED_TRADE")],
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
        <section
          id="product"
          className="mx-auto grid max-w-6xl scroll-mt-20 gap-10 px-4 pt-10 pb-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:pt-16"
        >
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-accent">Funded trading desks on Perpl</p>
            <h1 className="mt-3 text-[2rem] leading-[1.15] font-semibold tracking-[-0.02em] sm:text-[2.6rem]">
              Trading credit with risk enforced at the order layer.
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-fg-2">
              Stake a small amount, trade it under fixed rules, and graduate to a desk five times larger,
              funded by a liquidity pool. You trade the pool&apos;s credit but can never withdraw it. Every
              order is checked by the contract, and realized profit above your previous high is paid by the
              contract.
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
          <div className="mx-auto max-w-6xl px-4 py-12">
            <h2 className="text-xl font-semibold tracking-tight">How it works</h2>
            <p className="mt-1 text-sm text-fg-2">
              Testnet demo cohort: a 2% equity-gain target over at least two completed trades, with no minimum
              duration. These are the configured qualification rules, not anyone&apos;s results. Every step is
              a contract call you can verify.
            </p>
            <ol className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["Sign in", "Create a passkey account (Mera). No seed phrase, no browser extension."],
                [
                  "Stake",
                  "Get test AUSD and a little testnet MON for gas, then open a desk with at least 100 AUSD. The desk opens its own Perpl account.",
                ],
                [
                  "Evaluation",
                  "Trade BTC or ETH perps on your own stake. Target: +2% equity over at least two closed trades, within the risk limits.",
                ],
                [
                  "Graduation",
                  "The contract checks the target; anyone can trigger it, usually the keeper. The pool adds credit: a 100 AUSD stake becomes a 500 AUSD desk.",
                ],
                [
                  "Funded trading",
                  "Same per-order rules, plus pool exposure caps. A credit fee accrues only while a position is open, capped at 25% of your stake.",
                ],
                [
                  "Claim",
                  "With all positions closed, claim realized profit above your high-water mark. Fees are netted first; you receive 80% of the rest.",
                ],
              ].map(([t, b], i) => (
                <li key={t} className="flex gap-3">
                  <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-strong text-xs text-fg-2">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold">{t}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-fg-2">{b}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-sm text-fg-2">
              If equity falls 6% below where the tier started, or 3% in a day, new risk is refused and anyone
              can close the desk. Your stake absorbs losses first. The checks run when an order is placed:
              prices can still move against an open position between orders, and a fast price gap can lose
              more than your stake. The limits bound the risk; they do not prevent every loss.
            </p>
          </div>
        </section>

        <section aria-labelledby="why" className="border-t border-line">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 md:grid-cols-2">
            <div>
              <h2 id="why" className="text-xl font-semibold tracking-tight">
                Why Monad and Perpl
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-fg-2">
                Each order runs the desk&apos;s rule checks, the Perpl fill and a post-fill equity check in
                one transaction, so a rule can&apos;t be skipped by trading somewhere else. That needs an
                onchain order book with a programmable account interface (Perpl), on a chain where a
                multi-call trade is cheap (measured on Monad testnet: about 0.07 MON for a guarded relayed
                trade).
              </p>
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                How it differs from a prop-firm evaluation
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-fg-2">
                The qualification rules, the trading limits and the payout split are contract code, not a
                policy a company applies. The credit sits in the desk&apos;s own Perpl account and can only
                flow back to the pool, so it can be lent without trusting the trader&apos;s custody. What it
                does not have yet: real users, mainnet, or an independent audit.
              </p>
            </div>
          </div>
        </section>

        {/* Proof lives below the hero, compact; the full evidence table is on /proof. */}
        <section aria-labelledby="verified" className="mx-auto max-w-6xl px-4 py-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="verified" className="text-xl font-semibold tracking-tight">
                Verified on Monad testnet
              </h2>
              <p className="mt-1 text-sm text-fg-2">
                Every item is backed by a transaction receipt, read back on a second, independent RPC.
              </p>
            </div>
            <Link href="/proof" className={buttonClass("tertiary", "md")}>
              View proof <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
          <ul className="mt-5 grid gap-px overflow-hidden rounded-[var(--radius-md)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {verified.map(([label, ok]) => (
              <li key={label} className="flex items-center gap-2.5 bg-surface px-4 py-3 text-sm">
                {ok ? (
                  <CheckCircle2 size={16} aria-hidden className="shrink-0 text-safe" />
                ) : (
                  <CircleDashed size={16} aria-hidden className="shrink-0 text-muted" />
                )}
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
                <h2 className="text-xl font-semibold tracking-tight">
                  Risk rules, enforced at the order layer
                </h2>
                <p className="mt-1 text-sm text-fg-2">
                  The same rules run for every desk. No rule depends on the app or on a reviewer.
                </p>
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
                    <th scope="col" className="px-4 py-2 font-medium">
                      Rule
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Limit
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      Enforced by
                    </th>
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
            <p className="mt-2 text-xs text-muted">
              Labeled demo cohort on testnet: graduation at +2% after two closed trades. Standard cohort: +8%,
              five trades, 24 hours.
            </p>
          </div>
        </section>

        <section aria-labelledby="faq" className="border-t border-line">
          <div className="mx-auto max-w-3xl px-4 py-14">
            <h2 id="faq" className="text-xl font-semibold tracking-tight">
              Questions
            </h2>
            <div className="mt-5 divide-y divide-line rounded-[var(--radius-md)] border border-line bg-surface">
              {[
                [
                  "Is this real money?",
                  "No. Imprest runs on Monad testnet with test AUSD and test MON. Nothing is deployed on mainnet.",
                ],
                [
                  "What is the difference between my stake and the credit?",
                  "Your stake is your own AUSD and absorbs losses first. Credit is the pool's AUSD added at graduation. Both sit in your desk's Perpl account and can be traded; only the stake (minus losses and fees) and claimed profit can ever come back to you.",
                ],
                [
                  "Can I withdraw the credit?",
                  "No. The desk contract only sends AUSD to the pool, to you (claimed profit or the final residual), to the protocol treasury, or to a keeper as a one-time capped bounty.",
                ],
                [
                  "What happens if I lose?",
                  "If equity breaches the floor or daily limit, new risk is refused and anyone can close the desk. The pool is repaid first from what remains. A price gap larger than your stake can still cost the pool money; that risk is disclosed, not eliminated.",
                ],
                [
                  "What are the fees?",
                  "On the funded tier, a credit fee accrues only while a position is open, capped at 25% of your stake. Perpl trading fees apply as usual. Profit is split 80% to you, 15% to the pool and 5% to the protocol.",
                ],
                [
                  "Do I need gas?",
                  "Yes, on this site. Transactions are signed by your passkey and paid with testnet MON from the Monad faucet. Relayed (gasless) trades have been demonstrated from a script, but gasless trading is not available from this website because no public relayer is configured.",
                ],
                [
                  "Is there a mobile app?",
                  "There is an Expo app with the same screens. It runs in Expo Go, but passkey sign-in inside the app needs a linked domain, so for now sign in on the website in your phone's browser.",
                ],
                [
                  "Has it been audited?",
                  "No independent audit. The contracts have an internal automated review and a red-team test suite; details are on the proof and docs pages.",
                ],
              ].map(([q, a]) => (
                <details key={q} className="group px-4 py-3">
                  <summary className="cursor-pointer list-none text-sm font-medium text-fg marker:hidden">
                    <span className="flex items-center justify-between gap-3">
                      {q}
                      <span aria-hidden className="text-muted group-open:rotate-45">
                        +
                      </span>
                    </span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-fg-2">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Contracts</h3>
              <dl className="mt-2 space-y-1 text-[13px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">ImprestPool</dt>
                  <dd>{network.imprest.pool ? <AddressLink address={network.imprest.pool} /> : "pending"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">DeskFactory</dt>
                  <dd>
                    {network.imprest.factory ? <AddressLink address={network.imprest.factory} /> : "pending"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Perpl exchange</dt>
                  <dd>{network.perpl.exchange ? <AddressLink address={network.perpl.exchange} /> : "—"}</dd>
                </div>
              </dl>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Reproduce</h3>
              <p className="mt-2 text-[13px] text-fg-2">
                The full contract suite runs against Perpl&apos;s own exchange bytecode:
              </p>
              <code className="num mt-2 block rounded-[var(--radius-sm)] border border-line bg-surface px-2.5 py-1.5 text-xs">
                pnpm proof:local
              </code>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Limitations</h3>
              <p className="mt-2 text-[13px] text-fg-2">
                Testnet only. No independent audit. Profit claims wait for genuine market results.{" "}
                <Link href="/docs/KNOWN_LIMITATIONS.md" className="text-accent underline underline-offset-2">
                  Full list
                </Link>
              </p>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-xs text-muted">
          <span>
            Imprest · MIT · Monad, Perpl, Agora AUSD, Mera · build{" "}
            <a href={`https://github.com/TheWeirdDee/imprest/commit/${process.env.NEXT_PUBLIC_BUILD_SHA}`} className="num underline underline-offset-2 hover:text-fg">
              {(process.env.NEXT_PUBLIC_BUILD_SHA ?? "unknown").slice(0, 7)}
            </a>
          </span>
          <nav aria-label="Footer" className="flex flex-wrap gap-4">
            <Link href="/docs/SECURITY.md" className="hover:text-fg">
              Security
            </Link>
            <Link href="/docs/KNOWN_LIMITATIONS.md" className="hover:text-fg">
              Limitations
            </Link>
            <Link href="/docs/EVIDENCE_STANDARD.md" className="hover:text-fg">
              Evidence standard
            </Link>
            <Link href="/status" className="hover:text-fg">
              Status
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
