# Final audit

2026-10-08. Every line below is backed by a file in the repository or a run recorded in this
document. Nothing pending is presented as done.

## Verified

| Result | Label | Evidence |
| --- | --- | --- |
| ImprestPool and DeskFactory deployed; runtime bytecode matches the build on two RPCs | TESTNET VERIFIED | proof/receipts/deployments/ |
| Operator `0xB1c7…9Be4` owns both contracts; treasury `0xf9f4…3BdB` separate | TESTNET VERIFIED | owner() / protocolTreasury() reads on the second RPC |
| Pool seeded with 5,000 AUSD | TESTNET VERIFIED | proof/receipts/testnet/testnet_pool_seed.json |
| Desk opened its own Perpl account with 100 AUSD | TESTNET VERIFIED | testnet_desk_open.json |
| 6x order sent straight to `Desk.trade()` mined and reverted `LeverageExceeded`, no app involved | TESTNET VERIFIED | testnet_canonical_guarded_rejection.json |
| Premature graduation reverted `GraduationNotEligible` | TESTNET VERIFIED | testnet_premature_graduation_rejected.json |
| Real 0.001 BTC Perpl trade opened and closed | TESTNET VERIFIED | testnet_guarded_trade_open/close.json |
| Desk closed; 99.95 AUSD paid by contract, confirmed on an independent RPC 4.9 s after submit | TESTNET VERIFIED | testnet_desk_close_payout.json |
| Relayer: trader-signed EIP-712 intent submitted by the relayer (relayer paid gas), filled on Perpl, position confirmed on the second RPC | TESTNET VERIFIED | graduation-attempt/01-open.json (tx `0xb2e83f49…665e`) |
| Graduation earned on desk `0xfc65…FCC6`: short 0.00359 BTC held ~7.5 h, closed at +2.57 AUSD; then one small (0.5x equity) round trip to meet the 2-closed-trade rule; equity 102.32 AUSD vs 102.00 target | TESTNET VERIFIED | graduation-attempt/01-04 (all four relayed, all verified on the second RPC) |
| Keeper detected eligibility and called `graduate()` itself; pool funded 400 AUSD credit, desk now tier 1 with 502.29 AUSD | TESTNET VERIFIED | graduation-attempt/05-graduate-by-keeper.json (tx `0x4e616c99…87ed`, sender = keeper wallet) |
| Indexer (Envio 3.14, WSL + Docker) synced the deployed contracts; GraphQL returned the canonical-run events | LOCAL | docs/TESTNET.md |
| Perpl whitelist off, AUSD collateral, minimums (read-only, two RPCs) | TESTNET / MAINNET VERIFIED | proof/receipts/*/gate0.json |
| 120/120 contract tests on Perpl exchange bytecode | LOCAL | proof/local/forge-test-results.json |
| Reference model agrees 26/26 | LOCAL | proof/reference_model/results.json |
| Evidence validator passes with on-chain checks (35 claims) | — | `pnpm validate-evidence -- --onchain` |

## Pending (needs genuine conditions, not more code)

- Profit claim on testnet: needs realized profit above the tier-1 high-water mark (502.29 AUSD). One attempt was made on the funded desk (receipts 06-09): two real relayed round trips during a BTC drop lost 4.50 AUSD and the script stopped at its pre-set loss budget. Equity 497.79 AUSD, desk flat and active, 20 AUSD above its floor. The loss came out of the trader's first-loss stake; pool credit (400 AUSD) is intact. Nothing was forced.
- Mobile run on a physical phone: steps in MOBILE.md (Expo Go works for viewing; passkey sign-in needs a domain and a development build).
- Independent third-party security audit: NOT PERFORMED. Internal automated review: docs/SECURITY_REVIEW.md.
- Public hosting of the web app (owner chooses host and domain).
- Mainnet: not deployed; optional, needs real capital.

## Not implemented

Aurora cross-chain deposit, Kuru swap, buffered payout during Perpl withdraw rate limits,
dark mode, demo/simulated UI mode (deliberately not built, so nothing simulated can be
mistaken for testnet state).

## Test results (this pass, 2026-10-08)

| Suite | Result |
| --- | --- |
| Contracts (forge, Perpl bytecode) | 121 passed, 0 failed |
| @imprest/core (vitest) | 24 passed |
| Relayer | 11 passed |
| Keeper | 9 passed |
| Mobile shared logic (node:test) | 3 passed |
| Mobile typecheck; Android bundle (`expo export`); Metro dev bundle served | clean; built; HTTP 200, 16 MB |
| Workspace typecheck + web production build | clean |
| Web Playwright | 37 passed, 0 failed; 16 visual captures passed (`proof/screenshots/`) |
| Evidence validator with on-chain checks | PASSED (35 claims, 22 receipts) |
| Slither / forge lint / pnpm audit / npm audit | see SECURITY_REVIEW.md |

## Browser test anomaly (1024 px), investigated

History: one early full Playwright run stalled for about 2.4 hours and reported one overflow
failure at 1024 px. It then passed alone in 29.7 s.

Repeat investigation (2026-10-08): full suite run, then `--repeat-each 3` on the 320 px and
1024 px overflow tests against a fresh production build. 1024 px passed 4 of 4 times (26.3 s, 24.1 s,
23.8 s, 11.0 s). The full run did find one **real** overflow, at 320 px on /docs: a 42-character
contract address in the new TESTNET.md preview could not wrap. That was fixed (`min-w-0`,
`overflow-wrap:anywhere`) and passed 3 of 3 repeats. Conclusion: the 1024 px failure is not
reproducible; the most likely cause remains a stalled network request holding `networkidle`.
The 20-minute global timeout and the overflow helper's culprit report stay in place.

## Frontend

Redesigned: light-first warm-neutral token system with one indigo accent, compact hero,
live product panel (real Perpl testnet market + policy read from the deployed DeskFactory),
three-rule explainer, risk-rule table, evidence table, compact network pill instead of a
banner, collapsible mobile navigation. Pages: landing, dashboard, trade terminal, risk
center, desk and graduation, positions, history, claims, my receipts, LP console, proof,
docs, status (now with protocol status from claims).

## Mobile

Expo SDK 57 app on the shared core: Home, Trade, Positions, Risk, Claims, History.
See MOBILE.md.

## Security

Internal automated review (Slither, compiler/lint, dependency audits) in SECURITY_REVIEW.md.
Tested: replay, signature substitution/malleability, altered fields, cross-desk replay,
off-market closes, leverage bypass, cap bypass, under-reporting, unauthorized calls,
reentrancy (5 paths), venue halt, bankrupt positions, keeper spam, paired-desk attack.
Not done: independent third-party audit (NOT PERFORMED), formal verification.

## Remaining owner-only actions

```text
OWNER ACTION REQUIRED (optional, for the mobile bounty)
Why: passkeys on iOS/Android only work for an app associated with the relying-party domain.
Exact action: host the web app on a domain you control and tell me the domain (and, for iOS, your Apple Team ID).
Where: any static host; I generate the .well-known files and app config.
Expected result: the Expo dev build can create and use the same passkey account as the web.

OWNER ACTION REQUIRED (submission)
Why: hackathon accounts and videos are personal.
Exact action: create the team/project on hackathon.monad.xyz, record the demo and pitch videos, submit.
Where: hackathon.monad.xyz
Expected result: valid entry.
```
