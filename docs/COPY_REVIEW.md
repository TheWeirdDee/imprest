# Copy review: landing and README

## Landing page

| | Before | After |
| --- | --- | --- |
| Headline | "Trading credit with risk enforced at the order layer." | Unchanged; it is accurate and distinct |
| Intro | "Imprest turns verified trading history into use-restricted trading credit…" (mechanism first) | "Stake a small amount, trade it under fixed rules, and graduate to a desk five times larger, funded by a liquidity pool. You trade the pool's credit but can never withdraw it…" (what the trader does first) |
| How it works | Three abstract statements ("history determines eligibility…") | Six concrete steps with current demo-cohort numbers: sign in → stake (≥100 AUSD, gas) → evaluation (+2%, 2 closed trades) → graduation (5x desk) → funded trading (fee only while exposed, cap 25%) → claim (flat, above the high-water mark, 80% to trader). Then one line on losses. |
| FAQ | none | Real money? Stake vs credit. Withdrawing credit. Losses (including the disclosed gap risk). Fees and split. Gas (no public relayer). Mobile. Audit. |
| Proof | Compact "Verified on Monad testnet" list with a pending line | Unchanged |

Rationale: within about 10 seconds a trader should know what they do, what they get and what
they can't do (withdraw credit). Numbers come from the deployed cohort parameters, not the PRD
examples. Nothing promises profit, funding or safety beyond the contract conditions. Gap risk to
the pool is stated, not hidden.

## README

| | Before | After |
| --- | --- | --- |
| Tagline | "Real capital. Programmable risk. Paid by contract." ("real capital" overstates a testnet product) | "Trade with more than your own stake, under rules a contract enforces." |
| First screen | Mechanism paragraph, status note, no live link | Plain description, testnet-only status, live app, proof and status links, screenshot |
| Order | Rule table, then evidence (graduation shown as pending) | Who it's for → how it works → what works on the hosted app → judge path without a wallet → evidence matching the receipts → why Monad and Perpl → detailed rules and risks |
| Added | | AI disclosure; known risks; explicit hosted-service limits |
