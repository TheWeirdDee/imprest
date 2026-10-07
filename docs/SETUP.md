# Setup

## Requirements

- Node.js 22+ (tested on 24.13.1) and pnpm 11
- Foundry 1.5.1 (`forge`, `anvil`, `cast`)
- Python 3.12 (reference model, replay experiment, proof runner); standard library only
- Playwright Chromium for browser tests: `pnpm --filter @imprest/web exec playwright install chromium`
- Optional: Linux/macOS or Docker for the Envio indexer (Envio ships no Windows binary)

## Install

```bash
pnpm install
cd contracts && forge build && cd ..
node scripts/export-abis.mjs        # refresh ABIs in packages/core after contract changes
cp .env.example .env                # fill only what you need; never commit .env
```

## Test

```bash
pnpm proof:local                    # forge suite + reference model, writes proof/local
python -I scripts/run_local_proof.py --fork   # also the live-testnet fork test (network)
cd contracts && forge test          # contracts only
pnpm --filter @imprest/core test
pnpm --filter @imprest/relayer test
pnpm --filter @imprest/keeper test
pnpm test:reference                 # reference model gate
pnpm --filter @imprest/web e2e      # browser tests (starts the web app)
pnpm validate-evidence              # evidence rules; add -- --onchain for live checks
```

## Run the web app

```bash
NEXT_PUBLIC_IMPREST_ENV=testnet pnpm --filter @imprest/web dev    # http://localhost:3000
```

Without a recorded testnet deployment the app shows live Perpl testnet market data, the
proof page, docs and status, and marks desk actions PENDING.

## Reproduce the experiments

```bash
python -I proof/experiments/replay/fetch_data.py 2026-09-17 2026-09-30   # real 1 s klines, checksum-verified
python -I proof/experiments/replay/replay.py
cd contracts && forge test --match-contract PairedDesk                    # paired-desk self-attack
pnpm --filter @imprest/scripts mark-staleness testnet 90 25               # live mark-age sample
pnpm gate0                                                                 # live Perpl settings, two RPCs
```
