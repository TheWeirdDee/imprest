# Verification table and browser walkthrough

Audited commit: **`301157e`** (`301157e799408343a48e28a05344d6c657f6e667`). This is also the
commit the live site reports at https://imprest-chi.vercel.app/api/version (production, built
2026-10-09 13:01 UTC).

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
