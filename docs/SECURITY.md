# Security

## The claim, stated precisely

Desk code keeps pool credit inside the desk, the pool and Perpl, against a malicious trader,
relayer or keeper. It assumes Perpl and AUSD behave as their published ABIs say. Admin
actions by Perpl or Agora, a compromised trader device, and unaudited code risk are outside
the guarantee. This code has **not** been audited.

## Where money can go

AUSD leaves a desk only to: the Perpl account (margin), the pool (principal, fees, profit
share), the protocol treasury (profit share), the trader (realized profit above the HWM net
of fees, or the final residual), and a keeper (bounded bounty, once, on enforced settlement).
There is no admin function on `Desk` and no arbitrary transfer anywhere.

The pool moves AUSD to: registered desks for themselves (`fundDesk`, pausable), and LPs
(idle assets only). The operator cannot move desk or pool funds.

## Roles

| Party | Can | Cannot |
| --- | --- | --- |
| Trader | trade inside policy, claim realized profit, close a flat desk | withdraw credit, exceed limits, trade other markets, claim unrealized PnL |
| Relayer | submit signed intents, pay gas | alter, replay or invent orders (desk re-verifies signature, nonce, deadline) |
| Keeper | call enforce/graduate/checkpoint | enforce a healthy below-fee-cap desk; take the bounty twice |
| Operator | pause new desks and graduations; lower caps now, raise caps after a 24 h timelock; add new immutable cohorts; set treasury | move funds; change a live desk's floor, limits or splits |
| Perpl admins | freeze, force-close, deleverage, upgrade, toggle whitelist | (outside Imprest's control) |
| Agora | freeze or pause AUSD | (outside Imprest's control) |

## Defenses and their tests

| Attack | Defense | Test (contracts/test) |
| --- | --- | --- |
| Off-market close into an accomplice's bid | 50 bps price band on every order, closes included | `security/Attacks.t.sol::test_attack_offMarketCloseIntoAccompliceBidRefused` |
| Resting order fills later without a check | IOC/FOK only (no resting flag exists) | `unit/DeskPolicy.t.sol::test_orderType_*` |
| Replay / held order | strict nonce, deadline, per-desk EIP-712 domain, lastExecutionBlock stamp | `Attacks.t.sol::test_relay_*` |
| Signature malleability / substitution | OZ ECDSA (low-s), signer must be the desk trader | `test_relay_malleableHighSRejected`, `test_relay_wrongSignerRejected`, `test_relay_signatureForAnotherDeskRejected` |
| Leverage bypass (venue clamps instead of rejecting) | desk leverage check | `test_leverage_*`, `PerplProbe::test_probe_venueClampsLeverageAboveListing` |
| Trading through the floor | post-fill equity re-check reverts the whole transaction | `test_floor_postTradeBreachRevertsWholeTransaction` |
| Stale marks | new risk refused; reduce-only allowed; enforce waits | `test_staleMark_*` |
| Exposure-cap bypass across desks | pool records gross exposure per desk and perp, same transaction; pre-check before Perpl | `test_caps_*` |
| Under-reported exposure | pool requires `oldGross` to equal its own record | `test_unauth_deskCannotUnderReportExposure` |
| Claim of paper profit | flat-only claims of realized equity above HWM | `test_claim_unrealizedProfitCannotBeWithdrawn` |
| Double claim / double settlement | HWM semantics; `Closed` is terminal; pool `deskSettled` | `test_claim_hwmPreventsReclaimAfterLossAndRecovery`, `test_settledDeskIsInert` |
| Keeper spam / repeated bounty | `DeskHealthy` revert; bounty only at final settlement | `test_enforce_healthyDeskRejected`, `test_enforce_breachSettlesWaterfallAndPaysKeeperOnce` |
| Partial close settles early | settlement only when flat; `PartialClose` pays nothing | `test_enforce_partialCloseDoesNotSettleAndPaysNothing` |
| Reentrancy via venue or token | `nonReentrant` on every desk entry point | `security/Reentrancy.t.sol` (5 re-entry paths) |
| Unauthorized pool calls | `onlyDesk`, factory-only registration | `test_unauth_*` |
| Venue halted / reverting | named errors bubble; enforce catches and records | `test_venue_*` |
| Paired opposite desks (Sybil) | no Sybil claim; measured caps | `security/PairedDesk.t.sol`, DECISIONS D-009 |

## Services

- Keys come only from environment variables; `.env` is gitignored; logs never include keys
  or signatures (relayer test `never logs signatures`).
- The relayer and keeper simulate before sending and cap gas (Monad charges the limit).
- The indexer and UI never authorize money movement; money screens confirm on a second RPC.

## Reporting

This is hackathon software on testnet. Do not deposit real funds. Report issues privately
to the maintainers before disclosure.
