# Build state

Snapshot of the repository as built on 2026-10-07. Statuses use the evidence labels from
[EVIDENCE_STANDARD.md](EVIDENCE_STANDARD.md). Nothing here is presented as a network result
unless it says TESTNET VERIFIED or MAINNET VERIFIED.

## Starting point (audit)

The repository started with two files: the PRD v2 and v3 markdown documents. No git
history, no code, no contracts, no tests, no environment files, no deployments. Foundry was
not installed. Both PRDs were moved to `internal/` (gitignored, per the PRD build contract).

## What exists now

| Area | Path | State |
| --- | --- | --- |
| Contracts | `contracts/src` | ImprestPool, DeskFactory, Desk, SettlementMath, IPerplExchange. Compile with solc 0.8.28 (via-IR). |
| Contract tests | `contracts/test` | 120 tests in 11 suites against Perpl's own exchange bytecode; all pass (LOCAL_REPRODUCTION). |
| Perpl harness | `contracts/test/perpl-harness`, `contracts/perpl-artifacts` | Perpl exchange bytecode rc_v1.1.7-203 from perpl-sdk (MIT), hashes in MANIFEST.json. |
| Testnet fork test | `contracts/test/perpl/TestnetFork.t.sol` | Desk against a fork of live Monad testnet: real Perpl account, real book fill. Passes (SIMULATED). |
| Deploy script | `contracts/script/Deploy.s.sol` | Simulated against forked testnet state. Not broadcast (needs a funded key: owner action). |
| Reference model | `proof/reference_model` | Independent Python model; 26/26 cases agree with contract outputs. |
| Paired-desk self-attack | `contracts/test/security/PairedDesk.t.sol`, `proof/experiments/paired-desk` | 8 scenarios measured (LOCAL_REPRODUCTION). |
| Replay experiment | `proof/experiments/replay` | Pre-registered; ran on 51 real BTC/ETH windows; null threshold hit (SIMULATED). |
| Gate 0 | `scripts/src/gate0.ts`, `proof/receipts/{testnet,mainnet}/gate0.json` | Live reads on two RPCs per network (read-only, verified). |
| Shared TS core | `packages/core` | Config loader, ABIs, errors, EIP-712, policy pre-check, accounting, verification state machine, evidence rules. 24 tests pass. |
| Web app | `web` | Next.js 16: landing, app (dashboard, trade, risk, desk, positions, history, claims, receipts), LP console, proof, docs, status. Builds clean. |
| Relayer | `relayer` | EIP-712 verification, nonce/deadline/registry/quota checks, simulation, capped gas. 11 tests pass. Not running (needs a funded key). |
| Keeper | `keeper` | Direct-RPC watcher; simulate-then-send enforce/graduate/checkpoint. 9 tests pass. Not running (needs a funded key + deployment). |
| Indexer | `indexer` | Envio v3 config generator, schema, handlers. Config validates against Envio's schema. Not run: Envio has no Windows binary. |
| Evidence system | `proof/claims`, `scripts/src/build-claims.ts`, `scripts/src/validate-evidence.ts` | 30 claims generated from artifacts; validator passes (with on-chain checks). |
| Mobile app | `app` | Not built. See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md). |

## What is real vs mocked

- **Real**: Perpl's exchange bytecode in the harness; live testnet and mainnet reads in
  Gate 0 and the status page; live Perpl testnet market data in the terminal; the forked
  testnet state in the fork test; Binance price history in the replay.
- **Mocked, and labeled**: the local harness's market maker and its insurance fund (test
  scaffolding around Perpl's real bytecode); the relayer tests' chain port; the
  development-only mock account (local network only, behind a flag, labeled
  DEVELOPMENT MOCK).
- **Fake data**: none. Unmeasured values render as PENDING.

## Network configuration

`config/networks.json` is the single source of addresses. Testnet and mainnet Perpl and
AUSD addresses were read on chain (Gate 0). Imprest deployment addresses are `null` in all
environments until a deployment receipt exists.

## Contract deployment status

| Network | Status |
| --- | --- |
| Local Foundry EVM | Deployed in every test run (LOCAL_REPRODUCTION) |
| Monad testnet fork | Deployed in the fork test and the deploy dry-run (SIMULATED) |
| Monad testnet | TESTNET_VERIFIED: pool `0x85fFff6B1e8e62d2cE8ACA45B69AE530C6FbF457`, factory `0x1569EE4A7210e226db932B5B7633E63d3AC8c544`; canonical run receipts in proof/receipts/testnet |
| Monad mainnet | PENDING: needs real AUSD seed credit; not authorized |
