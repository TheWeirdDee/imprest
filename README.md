# Imprest

**Real capital. Programmable risk. Paid by contract.**

Imprest turns onchain trading history into use-restricted trading credit, with risk enforced
inside every order. A trader stakes AUSD, proves themselves on that stake, and graduates to a
real Perpl desk several times larger, funded by an LP pool. The desk contract owns the
Perpl account, checks and stamps every order, re-checks equity after the fill in the same
transaction, and pays realized profit above the high-water mark by contract.

> Built for Monad Metropolis, Track 1 (Onchain Finance & Trading). Status: **live on Monad testnet**
> (ImprestPool `0x85fFff6B1e8e62d2cE8ACA45B69AE530C6FbF457`, DeskFactory `0x1569EE4A7210e226db932B5B7633E63d3AC8c544`).
> Nothing on mainnet is claimed. See [docs/FINAL_STATUS.md](docs/FINAL_STATUS.md).

## The mechanism

```
onchain trading history -> use-restricted credit -> risk constraints in every order
                        -> contract-enforced trading -> automatic settlement
```

| Rule (every order) | Enforced by |
| --- | --- |
| Allowlisted market (BTC, ETH) | Desk |
| IOC or FOK only (no resting orders exist) | Desk stamp |
| Leverage at most 5x | Desk (Perpl clamps rather than rejects, so this is load-bearing) |
| Limit price within 50 bps of mark, closes included | Desk |
| 50 bps negative-PnL cap, 2-block execution window | Desk stamp, enforced by Perpl |
| Valid mark for new risk; reduce-only always allowed | Desk |
| Equity above the 6% floor and 3% daily floor before and after the fill | Desk (whole transaction reverts) |
| Gross funded exposure per market and per desk under caps | Pool, same transaction |
| Credit fee only while exposed, capped at 25% of stake | Desk |
| Claims flat-only, realized profit above the HWM, fees netted first | Desk |
| Breach / fee-cap settlement: principal, keeper (once), fees, trader | Desk + Pool |

## What is proven, and how strongly

Generated from evidence; full list in [docs/CLAIM_LEDGER.md](docs/CLAIM_LEDGER.md).

| Result | Label |
| --- | --- |
| 120 contract tests (unit, fuzz, invariant, security, paired-desk, reference vectors) pass against **Perpl's own exchange bytecode** | LOCAL_REPRODUCTION |
| An order one unit over 5x is rejected by the Desk contract, no position remains | LOCAL_REPRODUCTION |
| On a fork of **live Monad testnet**, a desk opened its own Perpl account and filled against the real order book | SIMULATED |
| Independent Python reference model agrees with contract outputs: 26/26 | LOCAL_REPRODUCTION |
| Perpl whitelisting is off; testnet margins in Agora AUSD; account minimums | TESTNET_VERIFIED / MAINNET_VERIFIED (read-only, two RPCs) |
| Paired long/short self-attack: 15% gap costs the pool 206.40 AUSD without an effective desk cap, ~0 with a 2x-desk cap | LOCAL_REPRODUCTION |
| Pre-registered replay: in-transaction enforcement vs a 1 s keeper, median overshoot gap **0.0 bps** (n = 51): **null threshold hit, headline dropped** | SIMULATED |
| Deployed on Monad testnet; a 6x order sent straight to the desk was mined and reverted `LeverageExceeded`; a real Perpl trade opened and closed; desk closed with a 99.95 AUSD payout verified on a second RPC | **TESTNET_VERIFIED** |
| Testnet graduation and profit claim (market-dependent), mainnet payouts, real traders | **PENDING** |

## Repository

```
contracts/   Foundry: Desk, DeskFactory, ImprestPool, SettlementMath; tests on Perpl bytecode
packages/core  shared TS: config, ABIs, errors, EIP-712, policy pre-check, accounting, verification
web/         Next.js: landing, trading app, risk center, claims, LP console, /proof, /docs, /status
relayer/     EIP-712 intent relayer (fetch handler + Node adapter)
keeper/      enforce / graduate / checkpoint watcher (simulate-then-send)
indexer/     Envio HyperIndex v3 config, schema, handlers
scripts/     Gate 0, claims, evidence validator, deployment sync, testnet canonical run
proof/       receipts, experiments, reference model, generated claims
config/      networks.json: the only place addresses live
docs/        architecture, security, threat model, runbooks, status
```

## Quick start

```bash
pnpm install
cd contracts && forge build && cd ..
pnpm proof:local                                   # contract suite on Perpl bytecode + reference model
NEXT_PUBLIC_IMPREST_ENV=testnet pnpm --filter @imprest/web dev    # http://localhost:3000
```

Requirements, every test command and the experiments: [docs/SETUP.md](docs/SETUP.md).
Testnet deployment (needs a deployer key funded with testnet MON):
[docs/TESTNET_DEPLOYMENT.md](docs/TESTNET_DEPLOYMENT.md). Demo path:
[docs/DEMO_RUNBOOK.md](docs/DEMO_RUNBOOK.md).

## Docs

[Architecture](docs/ARCHITECTURE.md) · [Security](docs/SECURITY.md) ·
[Threat model](docs/THREAT_MODEL.md) · [Decisions](docs/DECISIONS.md) ·
[Known limitations](docs/KNOWN_LIMITATIONS.md) · [Evidence standard](docs/EVIDENCE_STANDARD.md) ·
[Test matrix](docs/TEST_MATRIX.md) · [Networks](docs/NETWORKS.md) · [API](docs/API.md) ·
[Operations](docs/OPERATIONS.md) · [Failure modes](docs/FAILURE_MODES.md) ·
[Sponsor findings](docs/SPONSOR_FINDINGS.md) · [Dependency matrix](docs/DEPENDENCY_MATRIX.md)

## Mainnet limitations

Mainnet needs real AUSD seed credit (about 300 AUSD per the PRD) and owner authorization;
neither has happened. Perpl's testnet margins in Agora testnet AUSD, so the full AUSD flow is
provable on testnet. The register of what needs mainnet, why, and what it costs is in
[docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md).

## Evidence policy

Zero fabrication. Every public number is generated from a file in `proof/` and carries its
strongest honest label: PENDING, TARGET, SIMULATED, LOCAL_REPRODUCTION, TESTNET_VERIFIED or
MAINNET_VERIFIED. `pnpm validate-evidence` fails CI on any violation. User actions in the app
show "verified" only after an independent RPC reads back the expected state.

## AI disclosure

AI tools (Anthropic's Claude) drafted, under review, the contracts, tests, services, web app,
scripts, experiments and documentation in this repository. The human author specified the
product, the policy rules, the invariants and the economic parameters in the PRD, and is
responsible for reviewing them line by line before any capital is involved. All measured
results were produced by running the code in this repository; none were written by hand.

## License

MIT
