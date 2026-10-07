import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, FileJson, XCircle } from "lucide-react";
import type { Claim } from "@imprest/core";
import { SiteHeader } from "@/components/shell";
import { AddressLink, Card, EvidenceBadge, Pending, TxLink } from "@/components/ui";
import { getClaims, getDeployments, getForge, getFork, getGas, getPairedDesk, getReference, getReplay, getStaleness } from "@/lib/proof";

export const metadata: Metadata = { title: "Proof" };
export const dynamic = "force-static";

function Money({ c, label }: { c: Claim | undefined; label: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-5">
      <div className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">{label}</div>
      <div className="num text-3xl font-semibold">{c && c.value !== null ? String(c.value) : <Pending />}</div>
      <div className="flex items-center gap-2">
        {c && c.value !== null && <EvidenceBadge status={c.status} />}
        <span className="text-xs text-muted">{c?.network}</span>
      </div>
      <p className="text-xs leading-relaxed text-fg-2">{c?.statement}</p>
    </div>
  );
}

function ClaimLine({ c }: { c: Claim | undefined }) {
  if (!c) return null;
  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
        <div className="min-w-0 text-sm [overflow-wrap:anywhere] text-fg">{c.statement}</div>
        <div className="flex flex-wrap items-start gap-2 sm:max-w-[18rem] sm:flex-col sm:items-end">
          {c.value !== null ? (
            <>
              <span className="num text-sm break-words sm:text-right">{String(c.value)}</span>
              <EvidenceBadge status={c.status} />
            </>
          ) : (
            <Pending />
          )}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>{c.network}</span>
        {c.block_number !== null && <span className="num">block {c.block_number}</span>}
        {c.transaction_hash && <TxLink hash={c.transaction_hash} />}
        {c.contract && c.chain_id && <AddressLink address={c.contract} />}
        {c.sample_size !== null && (
          <span className="num">
            n = {c.sample_size}
            {c.denominator ? ` (${c.denominator})` : ""}
          </span>
        )}
        {c.evidence.map((e) => (
          <span key={e} className="inline-flex min-w-0 items-center gap-1">
            <FileJson size={11} aria-hidden className="shrink-0" />
            <span className="num min-w-0 break-all">{e}</span>
          </span>
        ))}
      </div>
      <details className="mt-1 text-xs text-muted">
        <summary className="cursor-pointer select-none">Method</summary>
        <p className="mt-1 leading-relaxed [overflow-wrap:anywhere]">{c.methodology}</p>
        <p className="num mt-1 [overflow-wrap:anywhere]">source: {c.source}</p>
      </details>
    </div>
  );
}

const AUSD = (v: number) => (v / 1e6).toFixed(2);

export default function ProofPage() {
  const C = getClaims();
  const forge = getForge();
  const fork = getFork();
  const ref = getReference();
  const gas = getGas();
  const paired = getPairedDesk().sort((a, b) => String(a.scenario).localeCompare(String(b.scenario)));
  const deployments = getDeployments();
  const stale = getStaleness();
  const replay = getReplay();
  const suites: { suite: string; tests: { test: string; pass: boolean; runs: number | null }[] }[] = forge?.forge?.suites ?? [];

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main id="main" className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Proof, not promises.</h1>
        <p className="mt-2 max-w-3xl text-fg-2">
          Every number here is generated from an evidence file in the repository and carries the strongest label it has earned:
          local reproduction, simulation, testnet or mainnet. Unmeasured results say PENDING, never zero.
        </p>

        {/* Money shot */}
        <section aria-labelledby="money" className="mt-8">
          <h2 id="money" className="sr-only">Headline results</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Money c={C.MAINNET_AUSD_PAID_BY_CONTRACT} label="AUSD paid by contract" />
            <Money c={C.MAINNET_CLAIM_TO_VERIFIED_SECONDS} label="Claim to verified balance" />
            <Money c={C.MAINNET_PRINCIPAL_LOSS_BEYOND_STAKES} label="Pool principal loss beyond stakes" />
          </div>
          <p className="mt-3 text-xs text-muted">
            The headline frame is reserved for the mainnet canonical run, which needs real AUSD seed credit (an owner action). Fee
            write-offs are reported separately from principal loss.
          </p>
        </section>

        <div className="mt-10 grid gap-6 [&>*]:min-w-0">
          <Card title="1. Testnet mechanism proof">
            <ClaimLine c={C.TESTNET_CANONICAL_GUARDED_REJECTION} />
            <ClaimLine c={C.TESTNET_CANONICAL_GRADUATION} />
            <ClaimLine c={C.TESTNET_CANONICAL_CLAIM_PAID} />
            <ClaimLine c={C.TESTNET_CANONICAL_CLOSE_PAYOUT} />
            <ClaimLine c={C.GATE0_WHITELIST_TESTNET} />
            <ClaimLine c={C.GATE0_COLLATERAL_TESTNET} />
            <ClaimLine c={C.GATE0_MIN_ACCOUNT_TESTNET} />
            <ClaimLine c={C.TESTNET_MARK_STALENESS_SAMPLE} />
            {stale && (
              <p className="pt-2 text-xs text-muted">
                Mark age on testnet over the sampled window: median {stale.summary[0]?.median_age_sec}s, max {stale.summary[0]?.max_age_sec}s
                (BTC). Desks refuse new risk whenever the mark is older than 60 s.
              </p>
            )}
          </Card>

          <Card title="2. Contract deployments">
            <dl className="mb-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-2"><dt className="text-muted">Network</dt><dd>Monad testnet (chain 10143)</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted">Mainnet</dt><dd>not deployed</dd></div>
            </dl>
            {deployments.length === 0 ? (
              <div className="flex flex-wrap items-center gap-3 text-sm text-fg-2">
                <Pending /> No Imprest deployment receipt exists yet. Testnet deployment needs a funded deployer key (an owner
                action, documented in docs/TESTNET_DEPLOYMENT.md).
              </div>
            ) : (
              deployments.map((d) => (
                <div key={d.file} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2 text-sm last:border-b-0">
                  <span>{d.contract_name}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <AddressLink address={d.address} />
                    {d.tx_hash && <TxLink hash={d.tx_hash} />}
                    <EvidenceBadge status={d.status} />
                  </span>
                </div>
              ))
            )}
          </Card>

          <Card title="3. Guarded order rejection">
            <p className="mb-2 text-sm text-fg-2">
              Frontend validation explains a block before signing. The contract rejection below is the one that matters: the order
              goes straight to <code className="num">Desk.trade()</code> with no UI involved.
            </p>
            <ClaimLine c={C.LOCAL_GUARDED_ORDER_REJECTION} />
            <ClaimLine c={C.TESTNET_CANONICAL_GUARDED_REJECTION} />
          </Card>

          <Card title="4. Live venue integration">
            <ClaimLine c={C.FORK_LIVE_TESTNET_BOOK_FILL} />
            {fork?.logs && (
              <details className="mt-2 text-xs text-muted">
                <summary className="cursor-pointer">Fork run log</summary>
                <pre className="num mt-2 overflow-x-auto rounded bg-surface-2 p-3 whitespace-pre-wrap">{fork.logs.join("\n")}</pre>
              </details>
            )}
          </Card>

          <Card title="5. Claim verification">
            <p className="text-sm text-fg-2">
              A payout counts only when an independent RPC reads the higher balance. The forced mismatch fixture proves an
              unverified state can never become success: it ends in <span className="text-breach">verification failed</span>.
              See packages/core/test/core.test.ts, &quot;forced mismatch fixture ends in verification_failed&quot;.
            </p>
            <ClaimLine c={C.TESTNET_CANONICAL_CLAIM_PAID} />
            <ClaimLine c={C.MAINNET_CLAIM_TO_VERIFIED_SECONDS} />
          </Card>

          <Card title="6. Accounting">
            <ClaimLine c={C.REFERENCE_MODEL_AGREEMENT} />
            {ref && (
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                {Object.entries(ref.results as Record<string, { match: boolean }[]>).map(([k, rows]) => (
                  <div key={k} className="rounded-lg border border-line bg-surface-2 p-3">
                    <div className="text-[11px] text-muted uppercase">{k.replace(/_/g, " ")}</div>
                    <div className="num mt-1 text-lg">
                      {rows.filter((r) => r.match).length}/{rows.length}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="7. Security and invariant tests">
            <ClaimLine c={C.LOCAL_CONTRACT_SUITE} />
            <ClaimLine c={C.LOCAL_INVARIANT_CAMPAIGN} />
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {suites.map((s) => {
                const pass = s.tests.filter((t) => t.pass).length;
                return (
                  <details key={s.suite} className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
                    <summary className="flex cursor-pointer items-center justify-between gap-2">
                      <span className="truncate">{s.suite.split(":").pop()}</span>
                      <span className="num flex items-center gap-1 text-xs">
                        {pass === s.tests.length ? <CheckCircle2 size={13} className="text-safe" aria-hidden /> : <XCircle size={13} className="text-breach" aria-hidden />}
                        {pass}/{s.tests.length}
                      </span>
                    </summary>
                    <ul className="mt-2 space-y-0.5 text-xs text-fg-2">
                      {s.tests.map((t) => (
                        <li key={t.test} className="flex items-center gap-1.5">
                          {t.pass ? <CheckCircle2 size={11} className="shrink-0 text-safe" aria-label="pass" /> : <XCircle size={11} className="shrink-0 text-breach" aria-label="fail" />}
                          <span className="num truncate">{t.test}</span>
                          {t.runs ? <span className="num text-muted">({t.runs} runs)</span> : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>
          </Card>

          <Card title="8. Paired-desk self-attack">
            <p className="text-sm text-fg-2">
              One actor runs a long desk and a short desk, both graduated, scored together. This measures a scenario envelope; it is
              not a universal loss bound. Imprest makes no Sybil-resistance claim; it caps the damage with onchain gross-exposure
              and per-desk notional limits.
            </p>
            <div className="mt-3 overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[760px] text-sm">
                <caption className="sr-only">Paired-desk scenarios</caption>
                <thead className="bg-surface-2 text-left text-xs text-muted">
                  <tr>
                    {["Scenario", "Move", "Desk cap", "Actor net", "Principal loss", "Pool profit share", "Keeper", "Pool net"].map((h) => (
                      <th key={h} scope="col" className="px-3 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="num">
                  {paired.map((d) => (
                    <tr key={d.scenario} className="border-t border-line">
                      <td className="px-3 py-2 font-sans">{d.scenario}</td>
                      <td className="px-3 py-2">{(d.total_move_bps / 100).toFixed(1)}%</td>
                      <td className="px-3 py-2">{AUSD(d.desk_notional_cap_base_units)}</td>
                      <td className="px-3 py-2">{AUSD(d.actor_net_extraction)}</td>
                      <td className={d.pool_principal_loss > 0 ? "px-3 py-2 text-breach" : "px-3 py-2"}>{AUSD(d.pool_principal_loss)}</td>
                      <td className="px-3 py-2">{AUSD(d.pool_profit_share)}</td>
                      <td className="px-3 py-2">{AUSD(d.keeper_paid)}</td>
                      <td className={d.pool_net_result < 0 ? "px-3 py-2 text-breach" : "px-3 py-2 text-safe"}>{AUSD(d.pool_net_result)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">
              All rows: LOCAL_REPRODUCTION on Perpl exchange bytecode, 100 AUSD stakes, 500 AUSD funded desks, AUSD units. Finding:
              under a 15% instantaneous gap, a per-desk notional cap of 2x desk size kept the pool net near zero; the deployment
              script uses that ratio. Early keeper enforcement acted as a free stop for the losing leg in the trend scenario.
            </p>
          </Card>

          <Card title="Replay experiment: atomic enforcement vs keeper">
            <p className="text-sm text-fg-2">
              Pre-registered before the first run: if the median overshoot gap against a 1-second keeper is under 10 bps, the
              atomic-enforcement headline is dropped. It was. In-transaction checks stop limit-breaking orders, but a pure price move
              still needs a keeper in both arms, and the tested order flow rarely produced an order one arm refused and the other
              accepted. The advantage shows only in the tail against slow keepers.
            </p>
            <ClaimLine c={C.REPLAY_ATOMIC_VS_KEEPER_OVERSHOOT} />
            {replay && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[620px] text-sm">
                  <caption className="sr-only">Replay arms</caption>
                  <thead className="bg-surface-2 text-left text-xs text-muted">
                    <tr>
                      {["Arm", "Breaches", "Median overshoot", "P90", "Max", "Pool loss beyond stake"].map((h) => (
                        <th key={h} scope="col" className="px-3 py-2 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="num">
                    {Object.entries(replay.summary as Record<string, any>).map(([arm, s]) => (
                      <tr key={arm} className="border-t border-line">
                        <td className="px-3 py-2 font-sans">{arm === "treatment" ? "Atomic (in-transaction)" : arm.replace("keeper_", "Keeper ").replace("s", " s")}</td>
                        <td className="px-3 py-2">{s.breaches}/{replay.windows}</td>
                        <td className="px-3 py-2">{s.median_overshoot_bps} bps</td>
                        <td className="px-3 py-2">{s.p90_overshoot_bps} bps</td>
                        <td className="px-3 py-2">{s.max_overshoot_bps} bps</td>
                        <td className="px-3 py-2">{s.total_pool_loss_beyond_stake}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="9. Local Perpl reproduction">
            <p className="text-sm text-fg-2">
              Perpl&apos;s own exchange bytecode (perpl-sdk, revision {forge?.environment?.perpl_revision ?? "rc_v1.1.7-203"}) runs on a
              local EVM with Monad&apos;s 128 KiB contract limit. Findings recorded by the probe suite: a contract can own a Perpl
              account; IOC with no liquidity leaves no position while FOK reverts; Perpl clamps order leverage to the listing maximum
              instead of rejecting it, so the desk&apos;s 5x check is load-bearing; the stamped 50 bps negative-PnL cap refuses adding
              to a position under water.
            </p>
            {gas && (
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                {[
                  ["Guarded trade (open)", gas.guarded_trade_open],
                  ["Guarded trade (close)", gas.guarded_trade_close],
                  ["Graduate", gas.graduate_with_funding],
                  ["Enforce + settle", gas.enforce_full_close_and_settle],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-lg border border-line bg-surface-2 p-3">
                    <div className="text-[11px] text-muted uppercase">{k}</div>
                    <div className="num mt-1 text-lg">{Number(v).toLocaleString("en-US")}</div>
                    <div className="text-[10px] text-muted">gas, Ethereum schedule</div>
                  </div>
                ))}
              </div>
            )}
            <ClaimLine c={C.LOCAL_GUARDED_TRADE_GAS} />
            {forge?.environment && (
              <p className="num mt-2 text-xs text-muted">
                {forge.environment.forge} · solc {forge.environment.solc} · exchange sha256 {forge.environment.perpl_artifacts?.Exchange?.deployed_sha256?.slice(0, 16)}…
              </p>
            )}
          </Card>

          <Card title="10. Mainnet dependency status">
            <ClaimLine c={C.GATE0_WHITELIST_MAINNET} />
            <ClaimLine c={C.GATE0_COLLATERAL_MAINNET} />
            <ClaimLine c={C.GATE0_MIN_ACCOUNT_MAINNET} />
            <ClaimLine c={C.MAINNET_AUSD_PAID_BY_CONTRACT} />
            <ClaimLine c={C.MAINNET_REAL_TRADERS_FUNDED} />
            <ClaimLine c={C.KEEPER_BOUNTY_COVERS_MONAD_GAS} />
            <ClaimLine c={C.REPLAY_ATOMIC_VS_KEEPER_OVERSHOOT} />
            <p className="mt-2 text-sm text-fg-2">
              What needs mainnet, why, and what it costs is listed in{" "}
              <Link href="/docs/KNOWN_LIMITATIONS.md" className="text-accent underline">
                Known limitations
              </Link>{" "}
              and{" "}
              <Link href="/docs/FINAL_STATUS.md" className="text-accent underline">
                Final status
              </Link>
              .
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
