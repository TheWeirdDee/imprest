# Verification table and browser walkthrough

> **Historical snapshot.** Sections 1–3 were recorded at commit `301157e`
> (`301157e799408343a48e28a05344d6c657f6e667`), which the live site reported on 2026-10-09 13:01 UTC.
> The site has been redeployed since: the current commit is whatever
> https://imprest-chi.vercel.app/api/version reports. Later updates are dated sections below.

Evidence types:

- **LOCAL:** agent-executed tests on this machine.
- **SCRIPT:** agent-sent testnet transactions.
- **BROWSER:** the owner, in the live site.
- **READ:** chain state read by the agent.

## 1. Verification table

| # | Item | Type | Procedure | Expected | Actual | Evidence | Open dependency |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Closed desk on Dashboard, Claims, Risk | BROWSER + LOCAL | Owner screenshots; `audit-fixes.spec.ts` with trader `0x976C…25fE` | Settlement card, no risk or eligibility | PASS (owner screenshots; 3 tests) | `web/e2e/audit-fixes.spec.ts` | — |
| 2 | Closed desk on /app/desk | LOCAL | Same spec: "desk page shows the settlement…" | No −100%, no progress, no Graduate, tier marked "closed at this tier" | PASS | same | Owner re-check on the live site |
| 3 | Closed desk on /app/trade/btc | LOCAL | Same spec: "trade shows one settled-desk message…" | One message; no risk meter, estimates, breach text or submit | PASS | same | Owner re-check on the live site |
| 4 | Sign-out clears data immediately, including across tabs | LOCAL + BROWSER | Spec (fails on the old hook); owner cross-tab check | Numbers gone without a refresh | PASS (owner confirmed both tabs) | same | — |
| 5 | History without the indexer | LOCAL | `pages.spec.ts` no-indexer test (runs in CI) | Loads; says how far back it reaches; links to the explorer | PASS | CI | Full history needs a hosted indexer |
| 6 | Graduation succeeds when eligible | LOCAL | `forge test --match-test graduat` (Perpl bytecode) | Tier 1, credit funded | PASS (`test_fullLifecycle…`, `_graduate` helper) | `proof/local/graduation-claim-tests.log` | — |
| 7 | Graduation rejected when premature, not flat, too few trades, under 24 h, or pool paused | LOCAL + SCRIPT | forge; testnet premature-rejection receipt | Named revert | PASS | log; `testnet_premature_graduation_rejected.json` | — |
| 8 | Graduation with insufficient pool liquidity | LOCAL | `test_graduation_insufficientPoolLiquidityRevertsAndLeavesDeskUnchanged` | `InsufficientIdle(credit, idle)`; desk unchanged | PASS | log | — |
| 9 | Real graduation on testnet | SCRIPT | Keeper `graduate()` on desk `0xfc65…FCC6` | Tier 1, 400 AUSD credit | PASS: tx `0x4e616c99…87ed` | `proof/receipts/testnet/graduation-attempt/05-graduate-by-keeper.json` | Not repeated in a browser (no eligible desk) |
| 10 | Profitable claim: fees first, exact 80/5/15 split, no double claim | LOCAL | `test_claim_payoutSplitIsExactAfterFeesAndCannotRepeat`, `test_claim_feesNettedFirstAndBookedOnce`, `test_claim_hwmPreventsReclaimAfterLossAndRecovery` | Exact amounts; second claim `NothingToClaim` | PASS | log | A testnet claim needs a desk with genuine profit (none exists) |
| 11 | Eligible testnet desks | READ, block 69545167 | `riskState` of all 3 desks | — | None eligible: `0x1197…c597` closed; `0x4802…bFaD` closed; `0xfc65…FCC6` active tier 1, equity 493.713365 vs HWM 502.289849 + fees 0.015997 (8.59 short) | this table | — |
| 12 | Relayer handles browser preflight | LOCAL | relayer unit test; `curl -X OPTIONS localhost:8787/v1/intents` | 204, CORS headers | PASS | `relayer/test/relayer.test.ts` | — |
| 13 | **Gasless trading from the public site** | — | — | Relayer reachable over HTTPS from imprest-chi.vercel.app | **BLOCKED** | — | The relayer runs only on the owner's PC. Making it public needs the owner's approval (section 3). |
| 14 | Contract suite | LOCAL | `cd contracts && forge test` | all pass | 123/123 | log | — |
| 15 | Browser suite | LOCAL | `PW_PORT=3400 pnpm test:e2e` | all pass | 81 passed, 25 skipped by design | `proof/local/web-e2e-results.json` | — |
| 16 | CI | CI | GitHub Actions on push | 4 jobs green | green on the latest runs | GitHub Actions | — |
| 17 | Deployed commit | READ | `GET /api/version` | Matches `main` | `301157e` | live response | — |

## 2. Browser walkthrough (owner)

Use the account you already have (`0x976C…25fE`); it holds testnet AUSD and MON. Gas figures are
**measured from your own earlier transactions** at about 102 gwei. Monad charges the full gas limit,
and the app sets that limit at 1.15× a simulated estimate. **You approve each transaction with your
passkey; nobody else needs your passkey or any key.**

### Flow A: re-check the closed-desk fixes (no transactions)

1. https://imprest-chi.vercel.app/app/desk: expect "Desk closed", 99.943818 AUSD returned,
   −0.056182 AUSD net, Evaluation "(closed at this tier)", no Graduate button and no −100%.
2. https://imprest-chi.vercel.app/app/trade/btc: expect one message, "This desk is closed and settled",
   and no risk meter, estimates or buy/sell button.

### Flow B: a new desk, one small trade, direct (you pay gas)

| Step | Where | Action | Tokens | Gas, you pay | Expected result |
| --- | --- | --- | --- | --- | --- |
| B1 | /app/desk | "1. Approve AUSD" for 100 | none move (approval only) | about 0.005 MON | Allowance 100 AUSD for DeskFactory `0x1569…c544` |
| B2 | /app/desk | "2. Open desk", demo cohort, 100 AUSD | 100 AUSD into your new desk's Perpl account | about 0.59 MON (measured: 5.82M gas) | A new desk appears on the dashboard, Active, Evaluation |
| B3 | /app/trade/btc | Long, IOC, size 0.001, leverage 3x, default limit price | none (margin stays in the desk) | about 0.07 MON (measured: 0.069) | Position 0.001 BTC long; Fills shows "limit … · mark …" |
| B4 | /app/trade/btc | Short, reduce-only, size 0.001 | none | about 0.06 MON (measured: 0.056) | Position flat; one closed trade |
| B5 (optional) | /app/claims | "Close desk" | your remaining stake returns to your wallet | about 0.045 MON (measured: 0.044) | "Desk closed" with the exact amount returned |

Stop at any step. Before B2, the app's preview shows the stake. Before B3, it shows notional,
margin, fee, and distance to the nearest limit.

### Flow C: gasless trade (only after section 3 is done)

| Step | Action | Tokens | Gas | Expected result |
| --- | --- | --- | --- | --- |
| C1 | On an active desk, /app/trade/btc, choose "Relayer (signed intent)", Long 0.001 BTC IOC 3x | none | **you pay nothing**; the relayer `0x017F…b728` pays about 0.07 MON | Position 0.001 BTC; on Monadscan the transaction's **sender is the relayer**, not you |
| C2 | Same, Short reduce-only 0.001 | none | relayer pays about 0.06 MON | Flat |

### Flow D: graduation and claim in the browser

Only if a desk **genuinely** reaches +2% over two closed trades (graduation), or realized profit above
its high-water mark (claim). The app shows progress on /app/desk and eligibility on /app/claims. Nobody
should trade just to produce this.

## 3. Making the relayer public (needs your decision)

The relayer runs on your PC at `localhost:8787`, which the public website can't reach. Options:

1. **Free and temporary: a Cloudflare quick tunnel from your PC.** Run
   `cloudflared tunnel --url http://localhost:8787` (no account, no cost). It prints a
   `https://…trycloudflare.com` address. It works while your PC is on and that command runs; the address
   changes on every restart. I did not start it myself: opening a public entry point to your PC needs
   your explicit approval.
2. **Permanent: host the relayer** on a small server (Railway, Fly.io or a VPS; usually a few dollars a
   month and an account in your name). It needs the relayer key in that server's environment.

Then, for either option:

- In Vercel → Project → Settings → Environment Variables, add `NEXT_PUBLIC_RELAYER_URL` set to the
  HTTPS address, and redeploy (it is baked in at build time).
- Check: `https://imprest-chi.vercel.app/status` should show "Relayer: operational".
- The relayer wallet holds about 4.83 MON, enough for about 65 relayed trades. Abuse is limited: only
  registered desks, valid trader signatures, simulation before sending, 20 intents per trader per minute (RELAYER_QUOTA_PER_TRADER_PER_MIN; lower it for a public relayer),
  and a gas cap.

## 4. Update 2026-10-12: owner walkthrough on desk `0x640a…5DBf`

What the owner did in the live site (OBSERVED by the owner; transactions checked on Monadscan):

| Step | Transaction | Result |
| --- | --- | --- |
| Approve 100 AUSD | `0x53ca5b57…26e093` | Allowance 100 AUSD, read back on the second RPC at block 70360557 |
| Open desk | `0x16172296…483a15` | Desk `0x640ac0F4a2191Ae5A9522291fE4bca786d515DBf`, Perpl account 1127, demo cohort |
| Open 0.001 BTC long | `0x24324645…d8bc50` | Entry 83,448.6 |
| Close (manual short, reduce-only) | `0x84f6914a…dfc175` | Flat; gas 0.058 MON |
| Profit claim | **none** | Equity 99.911529 vs HWM 100: no profit, so the button was correctly disabled |

**Claimable desks for wallet `0x976C…25fE`** (READ, second RPC `rpc-testnet.monadinfra.com`, block 70376530):

| Desk | Status | Flat | Equity | HWM | Fees | Eligible profit |
| --- | --- | --- | --- | --- | --- | --- |
| `0x480227b5a9c4ef965dc61ee60A5A666A336bbFaD` | Closed | yes | 0 | 100.000000 | 0 | — (closed) |
| `0x640ac0F4a2191Ae5A9522291fE4bca786d515DBf` | Active, Evaluation | yes | 99.911529 | 100.000000 | 0 | **0**: not claimable |

There is no genuinely profitable desk this wallet owns, so a browser profit claim **cannot be performed today**
without new profitable trading. Nothing was traded or changed to manufacture one. Contract tests cover
the claim instead (section 1, plus `test_claim_zeroProfitRejected`).

Fixes from this walkthrough (agent-executed tests at the commit that adds this section):

| Item | Fix | Test |
| --- | --- | --- |
| "Close" did nothing | It was a link to the page you were already on, with no pre-fill. Now a **Close position** button (sticky in the table, full-width on phones) pre-fills opposite side, current size, reduce-only and IOC, scrolls to the ticket and says what was prepared. Never auto-submits. The position is re-read before signing (already flat: nothing sent; size changed: updated and asks again). | `close-position.spec.ts` (BTC long/short, ETH long, keyboard, 390 px, flat desk, desktop reach without horizontal scroll). The position read is intercepted; nothing is sent. |
| Receipt showed `from-primary-receipt` | Expected values are now filled from the primary receipt's `TradeExecuted` event (numeric position size, filled lots, full/partial/none) and compared with Perpl `getPosition` on the second RPC at the same block | typecheck; next real trade shows numbers |
| "Policy check BLOCKED" after a successful close | After a verified full close: "Position closed", reduce-only reset, no stale block. Partial and no-fill outcomes are explained. | code; next real close |
| Several desks per account | A desk picker appears when an account has more than one desk, remembered per account | `audit-fixes.spec.ts` picker test |
| Graduation called twice; zero-profit claim | `MaxTierReached`, credit unchanged; `NothingToClaim` | `forge test` 125/125 |

Still open:

- browser profit claim (needs genuine profit);
- browser graduation (needs +2% over 2 closed trades);
- browser gasless trading (needs a publicly hosted relayer);
- full hosted history (needs a hosted indexer);
- a real partial IOC fill observed in the browser;
- the five remaining phone tabs.

## 5. 2026-10-13: fixes for the 2026-10-12 external audit (IP-001 to IP-017)

All are code fixes with local tests. No transaction was sent, no accounting or threshold changed, and
nothing was redeployed onchain.

| Finding | Fix | Evidence |
| --- | --- | --- |
| IP-001 receipt timeout shown as Failed | New `unknown` state; the hash is saved the moment it is broadcast; My receipts looks it up again; new sends are refused while one is unresolved (web). Mobile keeps the same guard for the app session only, with no storage across restarts. | core tests (state machine) |
| IP-002 reversal shown as no fill | Fill = change in the SIGNED position just before and at the trade block, measured on the primary and re-read on the second RPC; History reads the same | core tests (flip, partial flip, exact close, no fill); contract test `test_reversal_equalUnsignedSizesStillTraded` |
| IP-003 LP totals omit enforcing / older desks | Enforcing desks included until settled; up to 500 desks read; partial coverage labelled | source |
| IP-004 one provider could stand in for two | Confirmations use the primary only (no fallback); if it is down the badge says single RPC; badge names pool totals only | source |
| IP-005 mobile history 1000-block ranges | 100-block windows, 4 at a time, one retry, partial disclosure | app typecheck |
| IP-006 mobile verification compared a constant | Same signed-fill verifier as web; same-block receipt check | app typecheck |
| IP-007 `?close=abc` crashed the terminal | Only an allowlisted market id is accepted; others are removed | 7 malformed-link browser tests pass |
| IP-008 claim preview used unrealized equity | Preview uses realized equity; "Eligible" only when active, flat and above HWM | source |
| IP-009 "desk is flat" after one market | Other markets are read before saying so | source |
| IP-010 "Max safe order" ignored pool caps | "Max new order (est.)" = min(leverage, desk cap, market pool cap), names the binding limit; worst-case post-trade equity | source |
| IP-011 validator accepted a note as readback | VERIFIED needs a method plus a recorded reading; `--onchain` reconciles all 23 receipt transactions on both providers with decoded outcomes | `validate-evidence --onchain`: PASSED, 23 reconciled |
| IP-012 stale docs | Environment matrix, contracts README, test counts dated, this file marked as snapshot | this commit range |
| IP-014 address link target size | 24 px minimum height | axe: 14/14 routes pass |
| IP-015 mobile session races | Generation guard on passkey prompts, one session at a time, lock after 5 min in background, stale poll results dropped | app typecheck + tests |
| IP-016 no demo video | **Owner action** | — |
| IP-017 networkidle fragility | New tests wait for explicit UI states; older tests unchanged | — |

Still open, and only genuine market conditions or the owner can close them: a qualifying profit claim
in the browser, a new graduation, a real partial fill, a public relayer and indexer, native passkeys,
and the demo video.
