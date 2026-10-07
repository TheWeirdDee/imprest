# Final audit

2026-10-07. Every line below is backed by a file in the repository or a run recorded in this
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
| Perpl whitelist off, AUSD collateral, minimums (read-only, two RPCs) | TESTNET / MAINNET VERIFIED | proof/receipts/*/gate0.json |
| 120/120 contract tests on Perpl exchange bytecode | LOCAL | proof/local/forge-test-results.json |
| Reference model agrees 26/26 | LOCAL | proof/reference_model/results.json |
| Evidence validator passes with on-chain checks (33 claims) | — | `pnpm validate-evidence -- --onchain` |

## Pending (needs genuine conditions, not more code)

- Graduation on testnet: a desk must actually reach +2% over two closed round trips.
- Profit claim on testnet: needs genuine realized profit above the high-water mark.
- Mobile run on a device: passkey domain association and a development build (owner).
- Relayer, keeper, indexer running: funded keys / Linux host (owner).
- Public hosting of the web app (owner chooses host and domain).
- Mainnet: not deployed; optional, needs real capital.

## Not implemented

Aurora cross-chain deposit, Kuru swap, buffered payout during Perpl withdraw rate limits,
dark mode, demo/simulated UI mode (deliberately not built, so nothing simulated can be
mistaken for testnet state).

## Test results (this pass)

| Suite | Result |
| --- | --- |
| Contracts (forge, Perpl bytecode) | 120 passed, 0 failed |
| Reference model | 26/26 |
| @imprest/core (vitest) | 24 passed |
| Relayer | 11 passed |
| Keeper | 9 passed |
| Mobile shared-logic (node:test) | 3 passed |
| Mobile typecheck; Android JS bundle (`expo export`) | clean; bundle built (8 MB Hermes) |
| Web typecheck + production build | clean |
| Web Playwright | 37 passed, 0 failed (pages, banner, placeholder scan, 404, overflow at 320/375/390/414/430/768/1024/1280/1440/1920 px, PENDING-not-zero, broken links, proxy allowlist, terminal states, Mera passkey create/sign-in with virtual PRF authenticator, PRF_UNAVAILABLE, no dev mock) |

## Browser test anomaly (kept on record)

One earlier full Playwright run stalled for about 2.4 hours and reported one overflow failure
at 1024 px; the same test then passed alone in 29.7 s and in every later full run. Most likely
cause: a stalled network request (the pages poll live RPC and Perpl endpoints) holding
`networkidle`. Mitigations: a 20-minute `globalTimeout` and 15 s expectation timeout so a stall
now fails loudly, and the overflow helper now names the offending element. Status:
historical, not reproduced in subsequent controlled runs.

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

Tested: replay, signature substitution/malleability, altered fields, cross-desk replay,
off-market closes, leverage bypass, cap bypass, under-reporting, unauthorized calls,
reentrancy (5 paths), venue halt, bankrupt positions, keeper spam, paired-desk attack.
Not done: external audit, formal verification.

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
