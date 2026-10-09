# Hackathon readiness: Monad Metropolis, Track 01

Source: "Metropolis Hackathon Rules & Guidelines", version 3.0, last updated 3 September 2026,
supplied by the owner from the hackathon dashboard on 2026-10-09. Section numbers below refer to it.

## Key rules

| Rule | Official text (summary) | Section |
| --- | --- | --- |
| **Deadline** | **13 October 2026, 11:59 PM ET** (05:59 Lagos time on 14 October). No late submissions; the version recorded at the deadline is judged. | 4.2 |
| Team and entries | 1–5 members; one project; one track only | 2.4, 2.5 |
| Track 01 | "financial instruments, markets, and asset primitives, where the primary user is a trader, protocol, or financial product builder" | 3.3 |
| Judging (all tracks) | Product Quality & Completeness 20%, Technical Excellence 20%, Monad Integration 20%, Track Fit & Problem Relevance 20%, Innovation & Impact 20% | 5.2 |
| Sponsor bounties | Bounty requirements 40%, technical 30%, Monad integration 20%, innovation 10%; each sponsor publishes its own requirements | 3.3, 5.2 |
| Demo video | At most **3 minutes**, public (YouTube, Loom, Vimeo), the product in actual operation (not slides), showing Monad interactions | 4.1, 9.4 |
| Originality | Most of the work done in the Hackathon period; pre-existing components must be identified in the README | 4.1 |
| AI tools | Permitted; **must be disclosed in the README** | 4.1 |
| License | OSI-approved open source license; code public on GitHub during and after | 4.1, 7.2 |
| Do not submit | Private keys, credentials, trade secrets, third-party personal data | 5.3 |
| Prizes | USDC to the primary contact's wallet; KYC may be required | 6.1 |

## Mandatory requirements checklist

| Requirement | Status | Evidence |
| --- | --- | --- |
| Public GitHub repository with complete source | DONE | github.com/TheWeirdDee/imprest |
| README with setup instructions | DONE | README "Quick start" (prerequisites, clone, install, build, tests, run); a fresh clone built and served every page |
| Open source license | DONE | `LICENSE` (MIT) |
| Attribution of external code and libraries | DONE | README "Third-party code and attribution" |
| Commit history covering the build window | DONE | First commit 2026-10-07; about 890 public commits |
| **Demo video, at most 3 minutes, public, showing Monad interactions** | **OWNER: not recorded yet** | Script below |
| Explanation of how the project uses Monad | DONE | README "Why Monad and Perpl", landing page section |
| Contract addresses or transaction hashes | DONE | README status block, /status, /proof, `proof/receipts/` |
| Deployed on Monad mainnet or testnet | DONE (testnet) | ImprestPool `0x85fF…F457`, DeskFactory `0x1569…c544` |
| Originality statement; pre-existing components identified | DONE | README "Originality and build window" |
| AI tool use disclosed in the README | DONE | README "AI disclosure" |
| Docs: description, architecture, tech stack, setup and deployment | DONE | README sections; `docs/ARCHITECTURE.md`, `docs/DEPLOY_VERCEL.md`, `docs/TESTNET_DEPLOYMENT.md` |
| Working prototype, not a mockup | DONE | https://imprest-chi.vercel.app; the owner ran a full browser walkthrough on testnet |
| Clear problem statement and intended user | DONE | README "Who it is for and why" |
| No keys or credentials in the repo | DONE | `.env` and key files are gitignored; CI runs a secret scan on every push |
| **Submit through the hackathon website, Track 01** | **OWNER** | Before 13 Oct 11:59 PM ET |

## Scorecard against the official criteria (self-assessment)

| Criterion (20% each) | Strongest evidence | Main gap |
| --- | --- | --- |
| Product Quality & Completeness | Hosted app covering the full flow (sign in, faucet, open desk, trade, monitor, close, settle); 80 browser tests; accessibility scan clean | Profit claim not demonstrated with genuine profit; no gasless trading on the hosted site; history limited without the indexer |
| Technical Excellence | 121 contract tests on Perpl's own bytecode, fuzz and invariant tests, reference model 26/26, receipts verified on a second RPC, green CI | No independent audit; 2 acknowledged Low findings need a redeploy |
| Monad Integration | Deployed contracts; every rule and fill in one Monad transaction; keeper and relayer transactions on testnet; measured gas costs | The README makes no throughput claims, deliberately; the video must show the on-chain transactions |
| Track Fit & Problem Relevance | Trading-credit primitive for traders, LPs and protocol builders: Track 01's stated audience | No interviews with traders or LPs recorded |
| Innovation & Impact | Rules enforced inside each order on an onchain order book; credit that cannot leave the desk; an honest null result published | No users or mainnet yet |

## Sponsor bounties

Perpl (keeper and market-data use) and Mera (passkey accounts) are integrated. Eligibility depends on
each sponsor's published bounty requirements (Section 3.3), which are not in the general rules. The
owner should check each bounty page on the dashboard before claiming eligibility.

## Demo script (at most 3:00, product in operation)

1. **0:00–0:20** Landing page: what Imprest is, the TESTNET label, "How it works".
2. **0:20–1:20** Open the app, sign in with a passkey, use the dashboard faucet, open a desk (100 AUSD),
   and place a small long. Show the transaction on Monadscan (testnet).
3. **1:20–1:50** Set leverage to 6x: the policy check blocks it. Explain that the contract also rejects it
   on its own, and show the earlier `LeverageExceeded` receipt on /proof.
4. **1:50–2:20** Close the position and close the desk: the settlement card shows exactly what came back.
   Show the transaction.
5. **2:20–2:45** /proof: the keeper's `graduate()` transaction and the 400 AUSD pool credit (testnet).
6. **2:45–3:00** /status: live checks and the deployed commit, and what is pending (profit claim,
   mainnet, audit).
