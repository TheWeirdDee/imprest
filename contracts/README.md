# Imprest contracts

Solidity 0.8.28 (via IR), built and tested with Foundry 1.5.1. Tests run against Perpl's real
exchange bytecode, with a scripted market maker.

| Contract | Role |
| --- | --- |
| `src/ImprestPool.sol` | LP pool. Lends restricted credit to registered desks, enforces gross-exposure and per-desk notional caps, and books fees, profit share and principal loss. |
| `src/DeskFactory.sol` | Opens desks for a cohort, registers them with the pool, and predicts desk addresses. |
| `src/Desk.sol` | One trader's desk: a Perpl account the trader can trade but never withdraw from. Enforces leverage, price band, mark freshness, floors, fee cap and reduce-only, plus graduation, claims, enforcement and settlement. |
| `src/libraries/SettlementMath.sol` | Pure accounting: fee accrual, claim split, settlement waterfall. Mirrored by `packages/core` and the Python reference model. |

## Build and test

```sh
forge build
forge test            # unit, accounting, security, invariant and Perpl-bytecode tests
forge test --match-path test/perpl/TestnetFork.t.sol --fork-url $MONAD_TESTNET_RPC   # optional fork test
```

## Deploy

Use `script/Deploy.s.sol` with the runbook in [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md). The live
testnet addresses and their bytecode checks are in [docs/DEPLOYMENTS.md](../docs/DEPLOYMENTS.md) and
[docs/TESTNET_DEPLOYMENT.md](../docs/TESTNET_DEPLOYMENT.md). Do not redeploy the testnet contracts to
refresh a headline: the recorded evidence refers to the deployed addresses.

Design and risk notes: [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md),
[docs/SECURITY.md](../docs/SECURITY.md), [docs/SECURITY_REVIEW.md](../docs/SECURITY_REVIEW.md).
These are internal reviews, not an external security audit.
