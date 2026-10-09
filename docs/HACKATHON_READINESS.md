# Hackathon readiness: Monad Metropolis, Track 1

## Rules confirmed from public first-party sources

Retrieved 2026-10-08 from https://monad.xyz/metropolis.

| Rule | Official wording or fact | Imprest |
| --- | --- | --- |
| Deadline | Submissions close **13 October** (judging 14–27 Oct, winners 3 Nov). **Timezone not stated publicly.** | Submit on 12 Oct to be safe |
| Eligibility | "Anyone building a product on Monad. Teams and solo builders…" | OK |
| Build window | "what you show on 13 Oct should have been built during the six weeks" (1 Sep–13 Oct) | First commit 2026-10-07; all 780+ commits fall in the window |
| Deliverable | "A working product with a public project profile: a demo, a short write-up, and a link to the code" | Live app, README, repo; **demo video not yet recorded** |
| Code access | "Open sourcing is encouraged but not required. Judges need to be able to verify what you built" | Public repo |
| Track 1 | "Onchain Finance & Trading… Fast settlement makes new financial instruments and fully onchain markets more practical." | Fits: funded perps desks with contract settlement |

## Not confirmed (needs the signed-in dashboard)

- The judging rubric and its weights. The PRD lists Technical Execution 20%, Design & Craft 20%, Originality & Track Insight 15%, Founder & Market Readiness 25% and Traction & Path Forward 20%. That is an unconfirmed lead.
- Video length limits, AI-use disclosure policy, exact submission fields and the deadline timezone.
- Sponsor bounty conditions. Integrating a sponsor does not by itself make the project eligible.

**Owner action:** open the Metropolis dashboard, export or screenshot the Rules and Judging pages, and share them so this table can be completed.

## Scorecard against the PRD rubric (provisional, weights unconfirmed)

| Criterion | Evidence | Gap |
| --- | --- | --- |
| Technical execution | Deployed contracts, verified testnet receipts (rejection, trades, settlement, relayed trades, keeper graduation), 121 contract tests on Perpl bytecode, 50+ browser tests | Profit claim pending; relayer, keeper health and indexer not hosted |
| Design & craft | One design system; responsive 320–1920 px; 0 axe WCAG AA violations on 14 pages | Not tested with real users |
| Originality & track insight | Risk rules enforced inside each Perpl order; credit that cannot be withdrawn; honest null result on the replay experiment | Has to be explained clearly in the video |
| Founder & market readiness | PRD, economics and limitations documented | No user interviews or LP conversations recorded |
| Traction & path forward | None yet | No outside users; mainnet not deployed |

Biggest competitive weaknesses: **no traction**, **no outside users**, the **profit claim is still pending**, and there is **no demo video**. None of these are eligibility failures.

## Submission checklist

- [x] Public repo, README with live link and a path for judges that needs no wallet
- [x] Working hosted app on Monad testnet; contract addresses in README and /status
- [x] Truthful status: testnet only, no audit, pending items listed
- [x] AI-assistance disclosure in the README
- [ ] **Demo video** (owner records it; script below)
- [ ] Project profile and write-up on the dashboard (owner)
- [ ] Confirm the rubric, video limits and deadline timezone from the dashboard (owner)
- [ ] Redeploy Vercel from the latest `main` so the hosted copy matches the repo

## Demo script (about 3 minutes)

1. **Landing (20 s):** what Imprest is; testnet label; "How it works".
2. **/proof (40 s):** open the 6x rejection transaction on the explorer, then the keeper's `graduate()` transaction and the 400 AUSD credit.
3. **App (60 s):** sign in with a passkey, open the trade terminal, set leverage above 5x and show the policy block. If the account has gas, place a small order and show the verification steps complete.
4. **Risk and claims (30 s):** the floor and daily limit meter. Claims shows "nothing above the high-water mark" honestly.
5. **/status (20 s):** live checks and what is pending.
6. **Close (10 s):** the null replay result shows the claims are measured, not marketed.
