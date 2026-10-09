# Testnet deployment runbook

> **Status (2026-10-09): already deployed** on Monad testnet on 2026-10-07: ImprestPool
> `0x85fFff6B1e8e62d2cE8ACA45B69AE530C6FbF457`, DeskFactory
> `0x1569EE4A7210e226db932B5B7633E63d3AC8c544`, with a separate operator and treasury. Receipts:
> `proof/receipts/deployments/`. Use this runbook only to redeploy (a redeploy changes every
> address and invalidates the existing testnet evidence).

The steps below were built, rehearsed against a fork of live Monad testnet, and then run for real.

## Why this step is manual

Broadcasting needs a private key holding testnet MON for gas. MON comes from
https://faucet.monad.xyz, which requires a human to request it. Testnet AUSD needs no human:
Agora's faucet contract `requestFunds(address)` is called by the scripts.

## Owner actions (about 10 minutes)

1. **Create a fresh testnet-only key.** Never reuse a key that holds real funds.
   ```bash
   cast wallet new
   ```
   Put the private key in `.env` (gitignored) as `DEPLOYER_PRIVATE_KEY=0x...`.
2. **Fund the address with testnet MON** at https://faucet.monad.xyz (2 MON is enough for
   the deployment, pool seed and one canonical run; Monad charges the gas limit).
3. Set `IMPREST_OPERATOR` and `IMPREST_TREASURY` to separate addresses (the live deployment
   does). If unset, the deployer is both.

**Evidence to keep:** the faucet transaction or a screenshot of the funded balance is not
needed; every deployment fact is captured by the scripts below.

## Commands (run by the agent or the owner)

```bash
# 0. Re-run Gate 0 (whitelist, collateral, minimums) right before deploying
pnpm gate0

# 1. Deploy (Monad allows 128 KiB contracts; DeskFactory is 35 KB)
cd contracts
set -a; source ../.env; set +a
IMPREST_ENV=testnet forge script script/Deploy.s.sol \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $DEPLOYER_PRIVATE_KEY --broadcast --slow --code-size-limit 131072
cd ..

# 2. Record: receipts on two RPCs, bytecode match, config/networks.json addresses
IMPREST_ENV=testnet pnpm --filter @imprest/scripts sync-deployment

# 3. Canonical mechanism run on testnet (pool seed, desk, direct contract rejection,
#    premature graduation, real Perpl trade, claim if profitable, close with verified payout)
DEPLOYER_PRIVATE_KEY=$DEPLOYER_PRIVATE_KEY pnpm --filter @imprest/scripts testnet-demo

# 4. Rebuild claims, validate (with on-chain checks), regenerate docs
pnpm --filter @imprest/scripts build-claims
pnpm validate-evidence -- --onchain
pnpm --filter @imprest/scripts gen-docs
```

What each step writes:

| Step | Writes |
| --- | --- |
| Deploy | `contracts/broadcast/Deploy.s.sol/10143/run-latest.json` |
| sync-deployment | `proof/receipts/deployments/testnet-ImprestPool.json`, `testnet-DeskFactory.json`; addresses and deploy block in `config/networks.json` |
| testnet-demo | `proof/receipts/testnet/testnet_*.json`; `proof/claims-input/*.json` |
| build-claims | `proof/claims/*.json` (testnet claims become TESTNET_VERIFIED only from verified receipts) |

## After deployment

- Source verification on Monadscan needs an Etherscan v2 API key (`MONAD_EXPLORER_API_KEY`):
  `forge verify-contract <address> src/ImprestPool.sol:ImprestPool --chain 10143 --verifier etherscan`.
  Until done, deployment receipts say `source_verification: PENDING`.
- Relayer: fund a second key with ~1 MON, set `RELAYER_PRIVATE_KEY`, run
  `pnpm --filter @imprest/relayer start`, set `NEXT_PUBLIC_RELAYER_URL` for the web app.
- Keeper: set `KEEPER_PRIVATE_KEY` (or `KEEPER_DRY_RUN=true`), run
  `pnpm --filter @imprest/keeper start`, set `KEEPER_HEALTH_URL` for /status.
- Indexer: on Linux/macOS/Docker, `cd indexer && pnpm codegen && pnpm dev`; set
  `NEXT_PUBLIC_INDEXER_URL`.

## Rehearsal (no keys, no funds)

```bash
anvil --fork-url https://testnet-rpc.monad.xyz --code-size-limit 131072 --port 8546
# in another shell, with anvil's first default key:
IMPREST_ENV=testnet forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8546 \
  --private-key <anvil key 0> --broadcast --code-size-limit 131072
export IMPREST_OUTPUT_ROOT=/tmp/imprest-rehearsal IMPREST_RPC_PRIMARY=http://127.0.0.1:8546
pnpm --filter @imprest/scripts sync-deployment
DEPLOYER_PRIVATE_KEY=<anvil key 0> pnpm --filter @imprest/scripts testnet-demo
```

Rehearsal output is labeled SIMULATED, written outside the repository, and never counts as
testnet evidence. Delete `contracts/broadcast/Deploy.s.sol/10143` afterwards. On a frozen
fork Perpl's mark goes stale after 60 seconds, so the live trade step is expected to revert
with `MarkStale` in a rehearsal.
