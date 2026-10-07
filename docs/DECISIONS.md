# Decisions

Each entry: old assumption, observed evidence, consequence, decision, affected files, tests.

## D-001 Perpl's testnet collateral is Agora testnet AUSD

- **Old assumption (PRD sponsor finding 1):** Perpl's testnet collateral is a test USD token
  (`0xdf5b…c027`), not Agora's testnet AUSD, so AUSD + Perpl cannot run together on testnet.
- **Evidence:** `getExchangeInfo()` on the testnet exchange returns collateral
  `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`, whose `name()`/`symbol()` are "AUSD", read on
  two independent RPCs (proof/receipts/testnet/gate0.json). perpl-sdk 0.2.9 also lists it.
  The api-docs README still lists the old test USD token.
- **Consequence:** the full AUSD -> desk -> Perpl -> AUSD payout flow can be proven on
  testnet. Agora's public faucet supplies testnet AUSD.
- **Decision:** testnet track uses AUSD end to end; the docs PR to Perpl's README is a
  sponsor finding.
- **Files:** config/networks.json, docs/SPONSOR_FINDINGS.md. **Tests:** TestnetFork.t.sol.

## D-002 Whitelist gate cleared

- **Evidence:** `whitelistingEnabled() == false` on testnet and mainnet (gate0 receipts).
- **Decision:** no desk-authorization step. Re-run Gate 0 before any deployment.

## D-003 Testnet minimum stake is 100 AUSD

- **Evidence:** `getMinAccountOpenCNS()` = 100 AUSD on testnet, 10 AUSD on mainnet.
- **Decision:** a desk's stake is at least max(cohort minimum, venue minimum); the factory
  reads the venue minimum at open time. Testnet cohorts use 100 AUSD, so funded testnet desks
  are 500 AUSD.

## D-004 Perpl clamps leverage instead of rejecting it

- **Evidence:** a 20x order on a 15x listing filled with the deposit clamped to notional/15
  (PerplProbe `test_probe_venueClampsLeverageAboveListing`).
- **Decision:** the desk's own 5x check is load-bearing and tested at the boundary.

## D-005 maxNegPnlCollatBPS refuses adds to underwater positions

- **Evidence:** with the 50 bps stamp, adding to a position under water by ~1% reverts with
  `TakerOrderSettlementFailed` (DeskPolicy `test_negPnlStamp_venueRefusesAddingToUnderwaterPosition`).
  Perpl's docs: the cap is bps of resulting notional on fills that create/increase a position.
- **Decision:** kept; disclosed to traders as a venue rule ("you cannot average down past
  0.5%").

## D-006 Bankrupt positions need the venue's liquidation path

- **Evidence:** after a gap past bankruptcy, the desk's reduce-only IOC close fails
  (`CriticalPerpetualInsolvent` without insurance, `TakerOrderSettlementFailed` with it);
  Perpl's book liquidation posts at the liquidation price and does not fill; Perpl's
  auto-deleveraging (position administrator) removes it.
- **Decision:** `enforce()` catches close failures, records `EnforceCloseFailed`, stays
  `Enforcing` and pays nothing; settlement happens once the venue has flattened the desk.
  Disclosed as an operator/venue-dependent case.
- **Tests:** `test_enforce_bankruptPositionWithoutVenueInsuranceStaysEnforcing`,
  `test_enforce_gapPastStakeRecordsPrincipalLossAndZeroKeeper`.

## D-007 Reduce-only exposure updates are uncapped

- **Old:** PRD interface `recordExposure(perpId, oldGross, newGross)` checks caps.
- **Evidence:** exposure is recorded at the current mark; if the mark rose since the last
  record, a pure reduction can still raise recorded notional and would be blocked by a cap.
- **Decision:** add `releaseExposure` (uncapped) used only after reduce-only fills and at
  settlement. Increases still go through the capped `recordExposure`, and the desk pre-checks
  caps with the worst-case price before the order reaches Perpl.
- **Tests:** `test_caps_reductionAlwaysPossibleEvenOverCap`.

## D-008 Cap bootstrap window

- **Evidence:** with a 24 h timelock on increases, a fresh pool would have zero caps for a day.
- **Decision:** increases are immediate only before the factory is wired (no desk can exist);
  timelocked afterwards. **Test:** `test_caps_bootstrapImmediateOnlyBeforeFactoryWiring`.

## D-009 Per-desk notional cap set to 2x desk size

- **Evidence:** paired-desk self-attack: a 15% instantaneous gap with no effective desk cap
  cost the pool 206.40 AUSD principal (actor net +155.73); a cap of 2x desk size (1,000 AUSD
  for a 500 AUSD desk) left the pool net +0.60 (proof/experiments/paired-desk).
- **Decision:** Deploy.s.sol sets `deskNotionalCap = 2 x (5 x minStake)` and a gross cap per
  perp of 10 desks' worth. This is a measured scenario, not a universal bound.

## D-010 Atomic-enforcement overshoot headline dropped

- **Evidence:** pre-registered replay (51 real BTC/ETH windows): median overshoot gap vs a
  1-second keeper = 0.0 bps, under the 10 bps null threshold (proof/experiments/replay).
- **Decision:** per the PRD's pre-decided response, the pitch leads with real capital,
  contract-level refusal of limit-breaking orders, and contract payouts; no overshoot
  advantage is claimed. The tail difference against slow keepers (max 95 vs 151 bps at
  10 s) is reported as-is.

## D-011 Buffered payout (pool pays when Perpl's withdraw is rate-limited) deferred

- **PRD:** `bufferPayout` when Perpl withdrawals are rate-limited.
- **Decision:** not in V0. A failed withdrawal makes `claim()`/`close()` revert with a named
  error, and `enforce()` records `SettlementPending` and can be retried. Disclosed in
  KNOWN_LIMITATIONS.

## D-012 Flat-only claims keep the HWM at tier start equity

- **Decision:** a claim moves realized equity back to the HWM (= tier start equity), so the
  same profit cannot be claimed twice and losses must be recovered before any new claim.
  Fees are netted first. **Tests:** `test_claim_hwmPreventsReclaimAfterLossAndRecovery`,
  `test_claim_feesNettedFirstAndBookedOnce`, reference model.

## D-013 Fee accrual uses the previous checkpoint's exposure flag

- **Decision:** each state-changing call accrues fees for the elapsed interval at the
  exposure flag recorded at the last checkpoint, then refreshes the flag from Perpl. An
  external liquidation between checkpoints is charged conservatively up to the next
  checkpoint (anyone can call `checkpoint()`), capped at 25% of stake. Remainders carry so
  frequent checkpoints cannot round fees away. **Tests:** fee suite, reference model.

## D-014 DeskFactory relies on Monad's 128 KiB code limit

- **Evidence:** DeskFactory runtime is 35,291 bytes (embeds Desk creation code). Monad
  allows 128 KiB, the same limit Perpl's 128,199-byte exchange relies on.
- **Decision:** deploy with `--code-size-limit 131072`. Not portable to EIP-170 chains as is.

## D-015 Mark validity drives risk acceptance

- **Evidence:** testnet mark max age is 60 s; sampled median age 15 s, max 49 s, 0/90 stale
  samples in one window.
- **Decision:** new risk requires a valid mark; reduce-only orders run with a stale mark
  (price band checked against the last mark); `enforce()` waits for a valid mark.

## D-016 via-IR and block.timestamp in tests

- **Evidence:** with via-IR, `uint t = block.timestamp; vm.warp(...); vm.warp(t)` re-read the
  timestamp, so the restore was a no-op.
- **Decision:** tests use `vm.getBlockTimestamp()`. Production code never caches
  `block.timestamp` across external calls in a way this affects.
