# Final status

Updated 2026-10-08. This file summarizes; the evidence is in `proof/` and the generated
[CLAIM_LEDGER.md](CLAIM_LEDGER.md). Build detail: [BUILD_STATE.md](BUILD_STATE.md). Test
commands and results: [TEST_RESULTS.md](TEST_RESULTS.md).

## Verified on Monad testnet (receipts read back on a second RPC)

| Result | Evidence |
| --- | --- |
| ImprestPool `0x85fF…F457` and DeskFactory `0x1569…c544` deployed; bytecode matches the build | `proof/receipts/deployments/` |
| 6x order sent straight to `Desk.trade()` reverted `LeverageExceeded` | `testnet_canonical_guarded_rejection.json` |
| Premature `graduate()` reverted `GraduationNotEligible` | `testnet_premature_graduation_rejected.json` |
| Real Perpl trade opened and closed; flat desk closed, 99.95 AUSD paid by contract | `testnet_guarded_trade_*`, `testnet_desk_close_payout.json` |
| Trader-signed intents submitted by the relayer (from a script) filled on Perpl | `graduation-attempt/01-04, 06-13` |
| Graduation: desk `0xfc65…FCC6` reached +2% over two closed trades; the keeper sent `graduate()`; the pool funded 400 AUSD | `graduation-attempt/05-graduate-by-keeper.json` |
| Two real post-graduation attempts at profit lost money; the stake absorbed it; pool credit intact | `graduation-attempt/06-13` |

## Pending

- **Qualifying profit claim.** No realized equity above the tier-1 high-water mark exists. Read the
  current numbers on the hosted /app/claims page for desk `0xfc65…FCC6`; they change only with trading.
- **Independent security audit:** not performed. Internal automated review: [SECURITY_REVIEW.md](SECURITY_REVIEW.md).
- **Mainnet:** not deployed.
- **Hosted relayer, keeper health and indexer:** they run only on the developer's machine. The hosted
  site falls back to self-submitted transactions and direct chain reads, and says so on /status.
- **Passkeys in the native app:** need a linked domain and a development build.
- **Native app on a physical phone:** the owner opened Home on an iPhone in Expo Go (owner report with
  screenshot). The other five tabs are not yet confirmed on a device.
- **Real outside traders:** none.

## Not implemented

Aurora cross-chain deposit, Kuru swap, buffered payout during Perpl withdrawal limits, and a
demo/simulated mode (deliberately not built, so nothing simulated can pass for testnet state).
