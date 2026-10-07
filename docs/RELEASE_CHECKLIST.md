# Release checklist

Run before any release or submission. Every box needs evidence; unchecked boxes stay
unchecked.

## Build and tests

- [ ] `pnpm install` clean
- [ ] `cd contracts && forge build` (no warnings that matter)
- [ ] `pnpm proof:local` passes (forge suite + reference model) and is committed
- [ ] `python -I scripts/run_local_proof.py --fork` passes against current testnet
- [ ] `pnpm -r test` (core, relayer, keeper) passes
- [ ] `pnpm -r typecheck` passes
- [ ] `pnpm --filter @imprest/web build` clean
- [ ] `pnpm --filter @imprest/web e2e` passes (no console errors, no overflow 375-1440 px)

## Evidence

- [ ] `pnpm gate0` re-run within 24 h of release
- [ ] `pnpm --filter @imprest/scripts build-claims`
- [ ] `pnpm validate-evidence -- --onchain` passes
- [ ] `pnpm --filter @imprest/scripts gen-docs` (TEST_MATRIX, CLAIM_LEDGER)
- [ ] No TARGET/SIMULATED/LOCAL value appears anywhere labeled as a network result
- [ ] docs/FINAL_STATUS.md updated

## Secrets

- [ ] `git ls-files | xargs grep -nE "PRIVATE_KEY=0x[0-9a-f]{64}"` returns nothing
- [ ] `.env`, `.secrets/`, `internal/` ignored

## Deployment (when authorized)

- [ ] Testnet deployment receipts TESTNET_VERIFIED; bytecode match true
- [ ] Source verified on Monadscan
- [ ] Canonical testnet run receipts written
- [ ] Mainnet: explicit owner authorization recorded before any mainnet transaction
