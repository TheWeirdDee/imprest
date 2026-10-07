# Internal security review

**This is an internal automated security review, not an independent third-party audit.**
No external auditor has reviewed Imprest. The status page shows "Security audit: NOT
PERFORMED" and that stays true until a named firm publishes a report.

Date: 2026-10-07. Scope: `contracts/src` (Desk, DeskFactory, ImprestPool, libraries),
the relayer, the keeper, and every JavaScript dependency tree in the repository (pnpm
workspace and the Expo app).

## What was run

| Tool | Version | Target | Raw output |
| --- | --- | --- | --- |
| Slither (102 detectors) | 0.11.6 | `contracts/src` (lib, test, script excluded) | `proof/security/slither.json` |
| solc via Forge | 0.8.28, via-IR | full build | 0 compiler warnings |
| forge lint | Foundry 1.5.1 | `src` and `test` | `proof/security/forge-lint.txt` |
| pnpm audit (npmjs advisory DB) | pnpm 11.5.0 | web, core, relayer, keeper, indexer, scripts | `proof/security/pnpm-audit.json` |
| npm audit | npm 10 | `app/` (Expo) | `proof/security/app-npm-audit.json` |
| Red-team test suite | forge | 24 attack, 5 reentrancy, 8 paired-desk, 6 invariant tests | `contracts/test/security`, `contracts/test/invariant` |

Slither totals: 0 High, 24 Medium, 50 Low, 7 Informational (81 results). Every one was
read against the source. None of them allows funds to leave the allowed paths listed in
SECURITY.md.

## Findings

### SR-01: external calls before state writes (reentrancy pattern)

- **Severity:** Informational (Slither: 9 reentrancy-no-eth Medium, 4 reentrancy-benign Low, 1 reentrancy-events Low)
- **File:** `contracts/src/Desk.sol` (`claim`, `close`, `enforce`, `_closeAllSlices`, `_trade`, `graduate`, `_settle`, `activate`)
- **Description:** These functions call the Perpl exchange or the Imprest pool and then write desk state. Slither flags the ordering. The callees are fixed at deployment: the exchange comes from the factory constructor and the pool is Imprest's own contract. Neither is supplied by the user. AUSD has no transfer hooks, and every state-changing external entry point on Desk is `nonReentrant`.
- **Fix:** none needed. The reentrancy lock is the control.
- **Test:** `contracts/test/security/Reentrancy.t.sol` uses a malicious venue to re-enter claim, enforce, trade, close and graduate in the middle of a trade. All 5 calls revert.
- **Status:** Accepted, no code change.

### SR-02: post-trade mark validity is not checked before recording pool exposure

- **Severity:** Low
- **File:** `contracts/src/Desk.sol`, `_trade` (the `getPosition` call right after `execOrder`)
- **Description:** After the fill, the desk reads `(pos2, mark2, _)` and uses `mark2` to update the pool's per-perp gross exposure, without checking the validity flag. Risk-increasing trades are not affected. They revert `MarkStale` before the fill when any mark is stale, and again after the fill when the post-trade snapshot is invalid. The gap is limited to reduce-only trades placed while the mark is stale. These are allowed on purpose so a trader can always exit, and their exposure release can be priced off that stale mark. The exposure figure only feeds the gross and desk notional caps. It never moves money, and the next fill or settlement re-records it.
- **Fix:** in the next deployment, price reduce-only releases conservatively (the larger of the pre-trade and post-trade notional) when the mark is invalid. Changing the deployed contracts now would invalidate the bytecode-match evidence for the live testnet deployment, so the fix waits for the next deployment.
- **Test:** none yet. A test with a stale venue mark goes in with the fix.
- **Status:** Acknowledged. Not fixed in the deployed bytecode.

### SR-03: missing zero-address checks

- **Severity:** Low
- **File:** `contracts/src/ImprestPool.sol` (constructor `treasury`, `setFactory`), `contracts/src/Desk.sol` (constructor `trader_`)
- **Description:** These addresses are not checked against zero. `trader_` is always `msg.sender` of `DeskFactory.openDesk`, so it cannot be zero. The pool values are set only by the owner or deployer. On testnet they were read back as non-zero on the independent RPC (treasury `0xf9f4…3BdB`, factory `0x1569…c544`).
- **Fix:** add `ZeroAddress` reverts in the next deployment. No redeploy now, for the same reason as SR-02.
- **Test:** the deployed values are checked by `scripts/src/sync-deployment.ts`.
- **Status:** Acknowledged. The deployed configuration is verified.

### SR-04: ignored return values

- **Severity:** Informational (Slither: 8 unused-return Medium)
- **File:** `contracts/src/Desk.sol`, `contracts/src/DeskFactory.sol`
- **Description:** `execOrder`'s return value is ignored on purpose. The desk reads the authoritative post-fill position from `getPosition` instead of trusting the order result. The other cases are tuple fields that the function does not need, such as the mark in `_refreshExposed`, or exchange info fields other than the collateral token and decimals.
- **Fix:** none needed. SR-02 covers the one ignored field that matters.
- **Test:** `contracts/test/unit/DeskPolicy.t.sol` and the Perpl-bytecode tests assert post-fill state.
- **Status:** Accepted.

### SR-05: strict equalities and default-initialised locals

- **Severity:** Informational (Slither: 4 incorrect-equality Medium, 3 uninitialized-local Medium)
- **File:** `contracts/src/Desk.sol`, `contracts/src/ImprestPool.sol`
- **Description:** The `== 0` checks are sentinels on the contract's own storage (`readyAt == 0`, `elapsed == 0`, `gross == 0`), not on token balances that a third party could donate into. The flagged locals (`any`, `eqAfter`, `reason`) rely on Solidity's zero default on purpose.
- **Fix:** none needed.
- **Test:** `contracts/test/unit/DeskSettlement.t.sol`, `contracts/test/accounting/*`.
- **Status:** Accepted.

### SR-06: external calls in loops, timestamp use, style

- **Severity:** Informational (Slither: 25 calls-loop, 17 timestamp, plus cyclomatic-complexity, unindexed-event-address, too-many-digits)
- **File:** `contracts/src/Desk.sol`, `contracts/src/ImprestPool.sol`
- **Description:** The loops run over the cohort's market allowlist. It is immutable per cohort and holds 2 markets on testnet, so its gas is bounded. `block.timestamp` is used for UTC day boundaries, intent deadlines, fee accrual and cap timelocks. A few seconds of validator skew cannot move a day boundary or the 24 h timelock in any material way.
- **Fix:** none needed.
- **Test:** `contracts/test/perpl/GasProfile.t.sol` measures gas for a guarded trade.
- **Status:** Accepted.

### SR-07: compiler and lint output

- **Severity:** Informational
- **File:** `contracts/src/*.sol`
- **Description:** solc produced 0 warnings. forge lint reports 33 `unsafe-typecast` notes, 6 of them in `src`. All 6 are int256 to uint256 casts behind a `> 0` guard (`eq > 0 ? uint256(eq) : 0`), or uint256 to int256 casts of AUSD amounts, which are far below 2^255. The other lint notes are naming and style.
- **Fix:** none needed.
- **Test:** `contracts/test/accounting/SettlementMath.t.sol` fuzz tests.
- **Status:** Accepted.

### SR-08: workspace dependency advisories (Envio's bundled Express and ws)

- **Severity:** High (advisory severity), with low exposure: the affected code is the local indexer dev server only.
- **File:** `pnpm-workspace.yaml`
- **Description:** pnpm audit found 13 advisories (5 high, 2 moderate, 6 low): body-parser, path-to-regexp, qs, express, send, serve-static, cookie and ws. Every one came in through `indexer > envio > express` or `envio > viem > isows > ws`.
- **Fix:** scoped `overrides` raise these to patched versions within the same major.
- **Test:** `pnpm audit --registry https://registry.npmjs.org` now reports "No known vulnerabilities found". The indexer config validates and the indexer was run (see TESTNET.md).
- **Status:** Fixed.

### SR-09: Expo app dependency advisories

- **Severity:** High (advisory severity). These are build and dev-server tooling, not code shipped in the app bundle.
- **File:** `app/package.json`
- **Description:** npm audit found 28 advisories (18 high, 10 moderate). Moderate `uuid` and `decode-uri-component` were overridden to patched versions. The remaining 18 high trace to `braces` and `node-forge`. Metro's file watcher pulls in braces and Expo's code-signing pulls in node-forge. Neither has a patched release (the latest published versions are still in the vulnerable range). npm's suggested "fix" downgrades to Expo 44, which is not viable.
- **Fix:** moderates fixed. Highs wait on an upstream release.
- **Test:** after the overrides, the app typechecks, 3/3 tests pass, and the Android bundle exports.
- **Status:** Partially fixed. The remainder is documented here and in KNOWN_LIMITATIONS.md.

### SR-10: keeper failed loops on RPC rate limits

- **Severity:** Medium (operational). A keeper that misses loops is a keeper that misses enforcement.
- **File:** `keeper/src/run.ts`
- **Description:** On the public testnet RPC, the running keeper recorded 542 failed loops ("HTTP request failed") out of about 940. The contracts stay safe without a keeper, since the floor is enforced inside every trade, but that keeper was not doing its job.
- **Fix:** viem `fallback` transport across both configured RPCs with retries. The poll interval went from 2 s to 4 s, and errors now log status and details.
- **Test:** keeper unit tests 9/9. After the restart, 0 errors over 400 loops against live testnet.
- **Status:** Fixed.

### SR-11: relayer gas exposure on Monad

- **Severity:** Informational (confirmed control)
- **File:** `relayer/src/handler.ts`
- **Description:** Monad charges the gas limit, so a failed transaction still costs gas. During the graduation attempt, Perpl refused 14 intents (`VENUE_NEG_PNL_CAP`). The relayer's simulate-before-send caught every one and none was broadcast, so they cost 0 MON.
- **Fix:** none needed.
- **Test:** `relayer/test` 11/11, plus the live run in `.graduation.log` and receipts in `proof/receipts/testnet/graduation-attempt/`.
- **Status:** Verified on testnet.

## Not covered

No formal verification. No manual line-by-line review by a third party. No economic audit of
cohort parameters beyond the paired-desk and replay experiments. No fuzzing of Perpl itself.
No review of Mera's passkey library internals.
