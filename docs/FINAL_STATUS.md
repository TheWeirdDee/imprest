# Final status

As of 2026-10-07. Only evidenced items are marked done. Labels follow
[EVIDENCE_STANDARD.md](EVIDENCE_STANDARD.md).

## Product status

The mechanism (use-restricted credit, per-order policy enforcement, flat-only claims,
settlement waterfall, pool caps) is implemented and tested against Perpl's own exchange
bytecode and against a fork of live Monad testnet. It is **deployed on Monad testnet** (ImprestPool `0x85fFff6B1e8e62d2cE8ACA45B69AE530C6FbF457`, DeskFactory `0x1569EE4A7210e226db932B5B7633E63d3AC8c544`) and the canonical mechanism run has executed there with real AUSD and real Perpl fills. Mainnet is not deployed.

## Testnet status

| Item | Status |
| --- | --- |
| Gate 0 reads (whitelist off, AUSD collateral, minimums, market decimals) | TESTNET_VERIFIED (read-only, two RPCs) |
| Perpl mark freshness sample | TESTNET_VERIFIED (0/90 stale samples) |
| Deploy script against live testnet state | SIMULATED (fork dry-run and fork broadcast rehearsal) |
| Desk opens a real Perpl account and fills against the live testnet book | SIMULATED (fork test, passes) |
| Full canonical run (seed, desk, direct contract rejection, premature graduation, trade, close with verified payout) | SIMULATED (rehearsed end to end on a fork; trade step refused `MarkStale` on the frozen fork as designed) |
| Contracts deployed on testnet (receipts + bytecode match on two RPCs) | TESTNET_VERIFIED |
| Operator (`0xB1c7…9Be4`) accepted ownership; treasury separate (`0xf9f4…3BdB`) | TESTNET_VERIFIED (owner() read on second RPC) |
| Canonical run: pool seed, desk open, 6x order mined and reverted `LeverageExceeded`, premature graduation reverted, real 0.001 BTC trade opened and closed on Perpl, desk closed with 99.95 AUSD payout verified 4.9 s after submit | TESTNET_VERIFIED |
| Graduation and profit claim on testnet | PENDING (depends on the market; not forced) |

## Mainnet status

Gate 0 reads only (MAINNET_VERIFIED, read-only). No contract deployed, no transaction sent,
no capital used. Every mainnet result is PENDING; see the register in
[KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

## Contract status

- 120/120 tests pass on Perpl bytecode rc_v1.1.7-203 (unit, fuzz, stateful invariants,
  security, reentrancy, paired-desk, gas, reference vectors). `proof/local/forge-test-results.json`
- 38/40 directive invariants mapped to passing tests; I-35 by design, I-40 pending the
  real deployment. [TEST_MATRIX.md](TEST_MATRIX.md)
- Invariant campaign: 62,400 random handler calls across 650 logged runs, 2,600 desks,
  1,347 random trades, 1,002 graduations, 1,521 settlements. Random claims were rare
  (0 in the last campaign); claims are covered by deterministic tests and the reference model.
- Not audited.

## Frontend status

Built and running against testnet configuration: landing, dashboard, trading terminal
(live Perpl testnet candles, book, mark age), risk center, desk lifecycle, positions,
history, claims, receipts, LP console (two-RPC confirmed money values), proof page, docs,
status (live checks). Mera passkey sign-in tested in a browser with a virtual PRF
authenticator. Desk actions are wired but show PENDING until a deployment exists. No fake
data; unmeasured values render PENDING. Overflow-free from 375 to 1440 px.
`proof/local/web-e2e-results.json`

## Backend status

| Service | Status |
| --- | --- |
| Relayer | Built; 11 security tests pass; not running (needs a funded key) |
| Keeper | Built; 9 decision tests pass; not running (needs a key and a deployment) |
| Indexer | Built; config validates against Envio's schema; not run (no Windows binary; needs Linux/Docker and a deployment) |

## Security status

Red-team suite passes (replay, signature substitution and malleability, altered fields,
cross-desk replay, off-market closes, leverage bypass, cap bypass across desks,
under-reported exposure, unauthorized pool calls, reentrancy on five paths, venue halt,
bankrupt positions, keeper spam). Findings that changed the design: DECISIONS D-004 to
D-009. No audit.

## Accounting status

Waterfall, claim split and fee accrual: fuzzed in Solidity, mirrored in TypeScript, and
scored by an independent Python model against real executions (26/26). The PRD's
illustrative economics reproduce exactly (1.20 fee; 7.04 / 1.32 / 0.44 split; 9 AUSD
post-fee residual).

## Evidence status

31 claims generated from artifacts (4 TESTNET_VERIFIED and 3 MAINNET_VERIFIED read-only
observations, 13 LOCAL_REPRODUCTION, 2 SIMULATED, 9 PENDING). Validator passes, including
on-chain checks. [CLAIM_LEDGER.md](CLAIM_LEDGER.md)

## Documentation status

All directive docs written; TEST_MATRIX and CLAIM_LEDGER are generated from evidence.

## Known limitations

See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md). Headlines: no mobile (Expo) app; no
Aurora/Kuru funding flow; no buffered payout; DeskFactory relies on Monad's 128 KiB limit;
the atomic-enforcement overshoot headline was dropped after a pre-registered null result.

## Manual owner actions

| # | Action | Why manual | Evidence to capture |
| --- | --- | --- | --- |
| 1 | Create a fresh testnet-only key; put it in `.env` as `DEPLOYER_PRIVATE_KEY` | private key custody | none (never share the key) |
| 2 | Fund that address with ~2 testnet MON at faucet.monad.xyz | faucet requires a human | none needed; scripts record every transaction |
| 3 | (Optional) fund a relayer key and a keeper key with ~1 MON each | key custody, faucet | none |
| 4 | (Optional) Monadscan API key for source verification | account creation | the verification links |
| 5 | Decide on git: the PRD forbids commits without your authorization; nothing has been committed | owner decision | first commit hash |
| 6 | Mainnet: only with explicit authorization and real AUSD | real money | receipts are written automatically |

After 1 and 2, every remaining testnet step is scripted: [TESTNET_DEPLOYMENT.md](TESTNET_DEPLOYMENT.md).

## Remaining gates

| Gate | Status |
| --- | --- |
| 0 Environment | PASS (versions, networks, addresses read on chain, no secrets tracked) |
| 1 Contract | PASS (local) |
| 2 Perpl | PASS (local bytecode + live-testnet fork); live testnet PENDING |
| 3 Testnet | PASS (deployed, canonical run verified; graduation/claim pending market) |
| 4 Risk | PASS (local) |
| 5 Accounting | PASS (local + reference model) |
| 6 Attacks | PASS (local) |
| 7 Services | PARTIAL (built and unit-tested; not running) |
| 8 Frontend | PASS (built, E2E) |
| 9 E2E user journey on testnet | PARTIAL (scripted journey verified; browser journey with a passkey pending a manual session) |
| 10 Evidence | PASS |
| 11 Documentation | PASS |
| 12 Demo | READY (follow DEMO_RUNBOOK) |
| 13 Release | NOT DECLARED (testnet pending) |

## Unverified claims

None are displayed as verified. PENDING: testnet graduation and profit claim, mainnet payouts and
claim-to-verified seconds, principal loss across real breaches, real traders funded,
keeper bounty versus Monad gas.

## Final audit (three reviews)

**A. As a trader.** What Imprest does: the landing page states it in one line and six steps.
What my money is: the stake, first loss, shown on the dashboard and desk page. What credit
is: pool AUSD I can trade but never withdraw, sized by tier. What I can lose: my stake; the
risk meter shows the distance to the nearest limit in AUSD. What happens when I trade: the
ticket shows the policy check, estimates, and the enforcement price before signing. What
happens at a breach: new orders are refused and anyone can enforce; the claims page shows
the waterfall. When I can claim: only flat, only realized profit above the HWM, fees first.
*Gap:* graduation and claims depend on market results and cannot be demonstrated on demand.

**B. As a judge, in 90 seconds.** Problem and novelty: landing hero plus "familiar wrapper
vs primitive". Monad relevance: 128 KiB contracts (Perpl and DeskFactory), block-speed
enforcement, two-RPC verification. Perpl relevance: the desk owns a Perpl account; every
order is stamped. Technical depth and evidence: /proof (contract tests on Perpl bytecode,
live-testnet fork fill, reference model, paired-desk attack, the replay null result).
Limitations: listed on /proof and in KNOWN_LIMITATIONS. *Gap:* the working testnet demo is
PENDING the owner's funded key.

**C. As a security engineer.** Malicious trader, relayer, keeper; compromised UI; lying
indexer; stale RPC; gaps; reverting third parties: each row in THREAT_MODEL has a defense and
a test. Funds move only by contract rules in every tested scenario. *Residual:* gap losses
beyond stakes (bounded by caps in measured scenarios only), venue/issuer admin powers,
bankrupt positions that need Perpl's liquidation, and the absence of an external audit.

## Git

The PRD's build contract forbids commits without the owner's explicit authorization. The
repository is initialized and nothing has been committed; `git_commit` is `null` in every
receipt for that reason.
